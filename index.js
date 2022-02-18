#!/usr/bin/env node

'use strict'

const express = require('express')
const medUtils = require('openhim-mediator-utils')
const winston = require('winston')
const moment = require("moment")
const request = require('request')
const async = require('async')
const nconf = require('nconf')
const fs = require('fs')
const DHIS2 = require('./dhis2')
const FHIR = require('./fhir');
const mixin = require('./mixin');
const middleware = require('./middleware');

const port = 9001
// Config
var config = {} // this will vary depending on whats set in openhim-core
const apiConf = require('./config/config')
const mediatorConfig = require('./config/mediator')

// socket config - large documents can cause machine to max files open
const https = require('https')
const http = require('http')

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

// Logging setup
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {
  level: 'info',
  timestamp: true,
  colorize: true
})

/**
 * setupApp - configures the http server for this mediator
 *
 * @return {express.App}  the configured http server
 */
function setupApp() {
  const app = express()

  function updateTransaction(req, body, statatusText, statusCode, orchestrations) {
    const transactionId = req.headers['x-openhim-transactionid']
    var update = {
      'x-mediator-urn': mediatorConfig.urn,
      status: statatusText,
      response: {
        status: statusCode,
        timestamp: new Date(),
        body: body
      },
      orchestrations: orchestrations
    }
    medUtils.authenticate(apiConf.api, function (err) {
      if (err) {
        return winston.error(err.stack);
      }
      var headers = medUtils.genAuthHeaders(apiConf.api)
      var options = {
        url: apiConf.api.apiURL + '/transactions/' + transactionId,
        headers: headers,
        json: update
      }

      request.put(options, function (err, apiRes, body) {
        if (err) {
          return winston.error(err);
        }
        if (apiRes.statusCode !== 200) {
          return winston.error(new Error('Unable to save updated transaction to OpenHIM-core, received status code ' + apiRes.statusCode + ' with body ' + body).stack);
        }
        winston.info('Successfully updated transaction with id ' + transactionId);
      });
    })
  }

  const startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
  const endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
  const period = moment().subtract(1, 'months').format('YYYYMM')

  app.get('/syncImmunizationCoverage', (req, res) => {
    const dhis2 = DHIS2(config.dhis2)
    const fhir = FHIR(config.fhir)
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    req.timestamp = new Date()
    let orchestrations = []
    winston.info("Get DHIS2 Facilities From FHIR")
    fhir.getDHIS2Facilities(orchestrations, (facilities) => {
      winston.info("Translating DHIS2 Data Elements")
      dhis2.getDhisDataMapping("immunization", (err, dhisDataMapping, ageGroups) => {
        winston.info("Done Translating DHIS2 Data Elements")
        async.eachSeries(ageGroups, (ageGrp, nxtAgegrp) => {
          let dataValues = []
          mixin.translateAgeGroup(ageGrp.ageGrp, timrAgeGroup => {
            winston.info('Getting Immunization Data From Warehouse')
            middleware.getImmunizationCoverageData(startDate, endDate, timrAgeGroup, rows => {
              async.each(facilities, (facility, nextFacility) => {
                var HFRCode = facility.HFRCode
                var timrFacilityId = facility.timrFacilityId
                var facilityName = facility.facilityName
                mixin.extractFacilityData(timrFacilityId, rows, facData => {
                  if (facData.length >= 0) {
                    winston.info("Processing Immunization Data for " + facilityName)
                    dhis2.populateImmunizationValues({
                      period,
                      facData,
                      dataValues,
                      ageGrpCode: ageGrp.code,
                      dhisDataMapping,
                      HFRCode
                    }, (err, res, body) => {
                      return nextFacility()
                    })
                  } else {
                    return nextFacility()
                  }
                })
              }, function () {
                winston.info("Done processing immunization coverage for age group " + JSON.stringify(ageGrp))
                if (dataValues.length > 0) {
                  dhis2.saveBulkData(dataValues, orchestrations)
                }
                return nxtAgegrp()
              })
            })
          })
        }, () => {
          winston.info('Done Synchronizing Immunization Coverage!!!')
          updateTransaction(req, "", "Successful", "200", orchestrations)
        })
      })
    })
  })

  app.get('/syncSupplements', (req, res) => {
    const dhis2 = DHIS2(config.dhis2)
    const fhir = FHIR(config.fhir)
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    req.timestamp = new Date()
    let orchestrations = []
    let dataValues = []
    winston.info("Translating DHIS2 Data Elements")
    dhis2.getDhisDataMapping("supplements", (err, dhisDataMapping, ageGroups) => {
      winston.info("Done Translating DHIS2 Data Elements")
      async.each(ageGroups, (ageGrp, nxtAgegrp) => {
        mixin.translateAgeGroup(ageGrp.ageGrp, timrAgeGroup => {
          winston.info('Getting Supplements Data From Warehouse')
          middleware.getSupplementsData(startDate, endDate, timrAgeGroup, rows => {
            winston.info("Get DHIS2 Facilities From FHIR")
            fhir.getDHIS2Facilities(orchestrations, (facilities) => {
              async.each(facilities, (facility, nextFacility) => {
                var HFRCode = facility.HFRCode
                var timrFacilityId = facility.timrFacilityId
                var facilityName = facility.facilityName
                mixin.extractFacilityData(timrFacilityId, rows, facData => {
                  if (facData.length >= 0) {
                    winston.info("Processing Supplements Data for " + facilityName)
                    dhis2.populateSupplementsValues({
                      period,
                      facData,
                      dataValues,
                      ageGrpCode: ageGrp.code,
                      dhisDataMapping,
                      HFRCode
                    }, (err, res, body) => {
                      return nextFacility()
                    })
                  } else {
                    return nextFacility()
                  }
                })
              }, function () {
                winston.info("Done processing supplements coverage for age group " + JSON.stringify(ageGrp))
                return nxtAgegrp()
              })
            })
          })
        })
      }, () => {
        if (dataValues.length > 0) {
          dhis2.saveBulkData(dataValues, orchestrations)
        }
        winston.info('Done Synchronizing Supplements Data!!!')
        updateTransaction(req, "", "Successful", "200", orchestrations)
      })
    })
  })

  app.get('/syncBreastFeeding', (req, res) => {
    const dhis2 = DHIS2(config.dhis2)
    const fhir = FHIR(config.fhir)
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    req.timestamp = new Date()
    let orchestrations = []
    let dataValues = []
    winston.info("Translating DHIS2 Data Elements")
    dhis2.getDhisDataMapping("breastFeeding", (err, dhisDataMapping, ageGroups) => {
      winston.info("Done Translating DHIS2 Data Elements")
      async.series({
        EBF: (callback) => {
          let ageOper = [{
            operator: '<',
            age: '6 MONTH'
          }]
          middleware.getBreastFeedingData(startDate, endDate, ageOper, 1, (rows) => {
            return callback(null, rows)
          })
        },
        RF: (callback) => {
          let ageOper = []
          middleware.getBreastFeedingData(startDate, endDate, ageOper, 2, (rows) => {
            return callback(null, rows)
          })
        }
      }, (err, results) => {
        winston.info("Get DHIS2 Facilities From FHIR")
        fhir.getDHIS2Facilities(orchestrations, (facilities) => {
          async.eachSeries(facilities, (facility, nextFacility) => {
            var HFRCode = facility.HFRCode
            var timrFacilityId = facility.timrFacilityId
            var facilityName = facility.facilityName
            async.parallel({
                processEBF: (callback) => {
                  mixin.extractFacilityData(timrFacilityId, results.EBF, facData => {
                    if (facData.length >= 0) {
                      winston.info("Processing EBF Breast Feeding Data for " + facilityName)
                      dhis2.populateBreastFeedingValues({
                        period,
                        facData,
                        dataValues,
                        dhisDataMapping,
                        HFRCode
                      }, (err, res, body) => {
                        return callback(null)
                      })
                    } else {
                      return callback(null)
                    }
                  })
                },
                processRF: (callback) => {
                  mixin.extractFacilityData(timrFacilityId, results.RF, facData => {
                    if (facData.length >= 0) {
                      winston.info("Processing RF Breast Feeding Data for " + facilityName)
                      dhis2.populateBreastFeedingValues({
                        period,
                        facData,
                        dataValues,
                        dhisDataMapping,
                        HFRCode
                      }, (err, res, body) => {
                        return callback(null)
                      })
                    } else {
                      return callback(null)
                    }
                  })
                }
              },
              () => {
                return nextFacility()
              })
          }, () => {
            if (dataValues.length > 0) {
              dhis2.saveBulkData(dataValues, orchestrations)
            }
            winston.info("Done synchronizing Breastfeeding data")
            updateTransaction(req, "", "Successful", "200", orchestrations)
          })
        })
      })
    })
  })

  app.get('/syncChildWithBirthCert', (req, res) => {
    const dhis2 = DHIS2(config.dhis2)
    const fhir = FHIR(config.fhir)
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    req.timestamp = new Date()
    let orchestrations = []
    let dataValues = []
    winston.info("Translating DHIS2 Data Elements")
    dhis2.getDhisDataMapping("birthCertificates", (err, dhisDataMapping) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info('Getting Children With Birth Certificate Data From Warehouse')
      middleware.getChildWithBirthCertData(startDate, endDate, (rows) => {
        winston.info("Get DHIS2 Facilities From FHIR")
        fhir.getDHIS2Facilities(orchestrations, (facilities) => {
          async.eachSeries(facilities, (facility, nextFacility) => {
            var HFRCode = facility.HFRCode
            var timrFacilityId = facility.timrFacilityId
            var facilityName = facility.facilityName
            mixin.extractFacilityData(timrFacilityId, rows, facData => {
              if (facData.length >= 0) {
                winston.info("Processing Children With Birth Certificate Data for " + facilityName)
                dhis2.populateChildWithBirthCertValues({
                  period,
                  facData,
                  dataValues,
                  dhisDataMapping,
                  HFRCode
                }, (err, res, body) => {
                  return nextFacility()
                })
              } else {
                return nextFacility()
              }
            })
          }, function () {
            if (dataValues.length > 0) {
              dhis2.saveBulkData(dataValues, orchestrations)
            }
            winston.info('Done Synchronizing Children With Birth Certificate Data!!!')
            updateTransaction(req, "", "Successful", "200", orchestrations)
          })
        })
      })
    })
  })

  app.get('/syncPMTCT', (req, res) => {
    const dhis2 = DHIS2(config.dhis2)
    const fhir = FHIR(config.fhir)
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    req.timestamp = new Date()
    let orchestrations = []
    let dataValues = []
    winston.info("Translating DHIS2 Data Elements")
    dhis2.getDhisDataMapping("pmtct", (err, dhisDataMapping, ageGroups) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info('Getting PMTCT Data From Warehouse')
      middleware.getPMTCTData(startDate, endDate, (rows) => {
        winston.info("Get DHIS2 Facilities From FHIR")
        fhir.getDHIS2Facilities(orchestrations, (facilities) => {
          async.eachSeries(facilities, (facility, nextFacility) => {
            var HFRCode = facility.HFRCode
            var timrFacilityId = facility.timrFacilityId
            var facilityName = facility.facilityName
            mixin.extractFacilityData(timrFacilityId, rows, facData => {
              if (facData.length >= 0) {
                winston.info("Processing PMTCT Data for " + facilityName)
                dhis2.populatePMTCTValues({
                  period,
                  facData,
                  dataValues,
                  dhisDataMapping,
                  HFRCode
                }, (err, res, body) => {
                  return nextFacility()
                })
              } else {
                return nextFacility()
              }
            })
          }, function () {
            if (dataValues.length > 0) {
              dhis2.saveBulkData(dataValues, orchestrations)
            }
            winston.info('Done Synchronizing PMTCT Data!!!')
            updateTransaction(req, "", "Successful", "200", orchestrations)
          })
        })
      })
    })
  })

  app.get('/syncCTC', (req, res) => {
    const dhis2 = DHIS2(config.dhis2)
    const fhir = FHIR(config.fhir)
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    req.timestamp = new Date()
    let orchestrations = []
    let dataValues = []
    winston.info("Translating DHIS2 Data Elements")
    dhis2.getDhisDataMapping("ctc", (err, dhisDataMapping, ageGroups) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info('Getting CTC Data From Warehouse')
      middleware.getCTCReferal(startDate, endDate, (rows) => {
        winston.info("Get DHIS2 Facilities From FHIR")
        fhir.getDHIS2Facilities(orchestrations, (facilities) => {
          async.eachSeries(facilities, (facility, nextFacility) => {
            var HFRCode = facility.HFRCode
            var timrFacilityId = facility.timrFacilityId
            var facilityName = facility.facilityName
            mixin.extractFacilityData(timrFacilityId, rows, facData => {
              if (facData.length >= 0) {
                winston.info("Processing CTC Data for " + facilityName)
                dhis2.populateCTCValues({
                  period,
                  facData,
                  dataValues,
                  dhisDataMapping,
                  HFRCode
                }, (err, res, body) => {
                  return nextFacility()
                })
              } else {
                return nextFacility()
              }
            })
          }, function () {
            if (dataValues.length > 0) {
              dhis2.saveBulkData(dataValues, orchestrations)
            } else {
              winston.info("No CTC Data to save")
            }
            winston.info('Done Synchronizing CTC Data!!!')
            updateTransaction(req, "", "Successful", "200", orchestrations)
          })
        })
      })
    })
  })

  app.get('/syncMosquitoNet', (req, res) => {
    const dhis2 = DHIS2(config.dhis2)
    const fhir = FHIR(config.fhir)
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    req.timestamp = new Date()
    let orchestrations = []
    let dataValues = []
    winston.info("Translating DHIS2 Data Elements")
    dhis2.getDhisDataMapping("mosquitoNet", (err, dhisDataMapping, ageGroups) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info('Getting Mosquito Net Data From Warehouse')
      middleware.getDispLLINMosqNet(startDate, endDate, (rows) => {
        winston.info("Get DHIS2 Facilities From FHIR")
        fhir.getDHIS2Facilities(orchestrations, (facilities) => {
          async.eachSeries(facilities, (facility, nextFacility) => {
            var HFRCode = facility.HFRCode
            var timrFacilityId = facility.timrFacilityId
            var facilityName = facility.facilityName
            mixin.extractFacilityData(timrFacilityId, rows, facData => {
              if (facData.length >= 0) {
                winston.info("Processing Mosquito Net Data for " + facilityName)
                dhis2.populateLLINMosqNetValues({
                  period,
                  facData,
                  dataValues,
                  dhisDataMapping,
                  HFRCode
                }, (err, res, body) => {
                  return nextFacility()
                })
              } else {
                return nextFacility()
              }
            })
          }, function () {
            if (dataValues.length > 0) {
              dhis2.saveBulkData(dataValues, orchestrations)
            }
            winston.info('Done Synchronizing Mosquito Net Data!!!')
            updateTransaction(req, "", "Successful", "200", orchestrations)
          })
        })
      })
    })
  })

  app.get('/syncWeightAgeRatio', (req, res) => {
    const dhis2 = DHIS2(config.dhis2)
    const fhir = FHIR(config.fhir)
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    req.timestamp = new Date()
    let orchestrations = []
    let dataValues = []
    fhir.getDHIS2Facilities(orchestrations, (facilities) => {
      winston.info("Translating DHIS2 Data Elements")
      dhis2.getDhisDataMapping("weightAgeRatio", (err, dhisDataMapping, ageGroups) => {
        winston.info("Done Translating DHIS2 Data Elements")
        async.each(ageGroups, (ageGrp, nxtAgegrp) => {
          mixin.translateAgeGroup(ageGrp.ageGrp, timrAgeGroup => {
            winston.info('Getting Weight Age Ratio Data From Warehouse')
            middleware.getWeightAgeRatio(startDate, endDate, timrAgeGroup, rows => {
              winston.info("Get DHIS2 Facilities From FHIR")
              async.eachSeries(facilities, (facility, nextFacility) => {
                var HFRCode = facility.HFRCode
                var timrFacilityId = facility.timrFacilityId
                var facilityName = facility.facilityName
                mixin.extractFacilityData(timrFacilityId, rows, facData => {
                  if (facData.length >= 0) {
                    winston.info("Processing Weight Age Ratio Data for " + facilityName)
                    dhis2.populateWeightAgeRatioValues({
                      period,
                      facData,
                      dataValues,
                      ageGrpCode: ageGrp.code,
                      dhisDataMapping,
                      HFRCode
                    }, (err, res, body) => {
                      return nextFacility()
                    })
                  } else {
                    return nextFacility()
                  }
                })
              }, function () {
                winston.info("Done processing Weight Age Ratio for age group " + JSON.stringify(ageGrp))
                return nxtAgegrp()
              })
            })
          })
        }, () => {
          if (dataValues.length > 0) {
            dhis2.saveBulkData(dataValues, orchestrations)
          }
          winston.info('Done Synchronizing Weight Age Ratio!!!')
          updateTransaction(req, "", "Successful", "200", orchestrations)
        })
      })
    })
  })

  app.get('/syncChildVisit', (req, res) => {
    const dhis2 = DHIS2(config.dhis2)
    const fhir = FHIR(config.fhir)
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    req.timestamp = new Date()
    let orchestrations = []
    let dataValues = []
    fhir.getDHIS2Facilities(orchestrations, (facilities) => {
      winston.info("Translating DHIS2 Data Elements")
      dhis2.getDhisDataMapping("childVisit", (err, dhisDataMapping, ageGroups) => {
        winston.info("Done Translating DHIS2 Data Elements")
        async.each(ageGroups, (ageGrp, nxtAgegrp) => {
          mixin.translateAgeGroup(ageGrp.ageGrp, timrAgeGroup => {
            winston.info('Getting Child Visit Data From Warehouse')
            middleware.getChildVisitData(startDate, endDate, timrAgeGroup, rows => {
              winston.info("Get DHIS2 Facilities From FHIR")
              async.eachSeries(facilities, (facility, nextFacility) => {
                var HFRCode = facility.HFRCode
                var timrFacilityId = facility.timrFacilityId
                var facilityName = facility.facilityName
                mixin.extractFacilityData(timrFacilityId, rows, facData => {
                  if (facData.length >= 0) {
                    winston.info("Processing Child Visit Data for " + facilityName)
                    dhis2.populateChildVisitValues({
                      period,
                      facData,
                      dataValues,
                      ageGrpCode: ageGrp.code,
                      dhisDataMapping,
                      HFRCode
                    }, (err, res, body) => {
                      return nextFacility()
                    })
                  } else {
                    return nextFacility()
                  }
                })
              }, function () {
                winston.info("Done processing Child Visit for age group " + JSON.stringify(ageGrp))
                return nxtAgegrp()
              })
            })
          })
        }, () => {
          if (dataValues.length > 0) {
            dhis2.saveBulkData(dataValues, orchestrations)
          }
          winston.info('Done Synchronizing Child Visit!!!')
          updateTransaction(req, "", "Successful", "200", orchestrations)
        })
      })
    })
  })

  app.get('/syncTT', (req, res) => {
    const dhis2 = DHIS2(config.dhis2)
    const fhir = FHIR(config.fhir)
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    req.timestamp = new Date()
    let orchestrations = []
    let dataValues = []
    winston.info("Translating DHIS2 Data Elements")
    dhis2.getDhisDataMapping("tt", (err, dhisDataMapping, ageGroups) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info('Getting TT Data From Warehouse')
      middleware.getTTData(startDate, endDate, rows => {
        winston.info("Get DHIS2 Facilities From FHIR")
        fhir.getDHIS2Facilities(orchestrations, (facilities) => {
          async.each(facilities, (facility, nextFacility) => {
            var HFRCode = facility.HFRCode
            var timrFacilityId = facility.timrFacilityId
            var facilityName = facility.facilityName
            mixin.extractFacilityData(timrFacilityId, rows, facData => {
              if (facData.length >= 0) {
                winston.info("Processing TT Data for " + facilityName)
                dhis2.populateTTValues({
                  period,
                  facData,
                  dataValues,
                  dhisDataMapping,
                  HFRCode
                }, (err, res, body) => {
                  return nextFacility()
                })
              } else {
                return nextFacility()
              }
            })
          }, function () {
            if (dataValues.length > 0) {
              dhis2.saveBulkData(dataValues, orchestrations)
            }
            winston.info('Done Synchronizing TT Data!!!')
            updateTransaction(req, "", "Successful", "200", orchestrations)
          })
        })
      })
    })
  })

  app.get('/completeDataset', (req, res) => {
    res.end()
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    let orchestrations = []
    const dhis2 = DHIS2(config.dhis2)
    dhis2.completeDatasetRegistration(orchestrations, (errorOccured) => {
      winston.info('Done marking datasets as complete')
      if(errorOccured) {
        updateTransaction(req, "", "Successful", "500", orchestrations)
      } else {
        updateTransaction(req, "", "Successful", "200", orchestrations)
      }
    })
  })
  return app
}

function reloadConfig(data, callback) {
  const tmpFile = `${__dirname}/config/tmpConfig.json`;
  fs.writeFile(tmpFile, JSON.stringify(data, 0, 2), (err) => {
    if (err) {
      throw err;
    }
    nconf.file(tmpFile);
    return callback();
  });
}
/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function start(callback) {
  if (apiConf.register) {
    medUtils.registerMediator(apiConf.api, mediatorConfig, (err) => {
      if (err) {
        winston.error('Failed to register this mediator, check your config')
        winston.error(err.stack)
        process.exit(1)
      }
      apiConf.api.urn = mediatorConfig.urn
      medUtils.fetchConfig(apiConf.api, (err, newConfig) => {
        winston.info('Received initial config:', newConfig)
        config = newConfig
	      reloadConfig(config, () => {})
        if (err) {
          winston.info('Failed to fetch initial config')
          winston.info(err.stack)
          process.exit(1)
        } else {
          winston.info('Successfully registered mediator!')
          let app = setupApp()
          const server = app.listen(port, () => {
            let configEmitter = medUtils.activateHeartbeat(apiConf.api)
            configEmitter.on('config', (newConfig) => {
              winston.info('Received updated config:', newConfig)
              // set new config for mediator
              config = newConfig
              reloadConfig(config, () => {})
            })
            callback(server)
          })
        }
      })
    })
  } else {
    // default to config from mediator registration
    config = mediatorConfig.config
    reloadConfig(config, () => {})
    let app = setupApp()
    const server = app.listen(port, () => callback(server))
  }
}
exports.start = start

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => winston.info('Listening on ' + port + '...'))
}
