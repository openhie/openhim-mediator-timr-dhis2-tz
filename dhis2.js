'use strict'
const winston = require('winston')
const request = require('request')
const URI = require('urijs')
const utils = require('./utils')
const async = require('async')
const isJSON = require('is-json')
const moment = require('moment')
const catOptOpers = require('./config/categoryOptionsOperations.json')
const dataElementsOpers = require('./config/dataElementsOperations.json')
const immunizationConcMap = require('./terminologies/timr-DHIS2-immunization-conceptmap.json')
const supplementsConcMap = require('./terminologies/timr-DHIS2-supplements-conceptmap.json')
const breastFeedConcMap = require('./terminologies/timr-DHIS2-breastfeeding-conceptmap.json')
const TTConcMap = require('./terminologies/timr-DHIS2-TT-conceptmap.json')

module.exports = function (cnf) {
  const config = cnf
  return {
    getTimrCode: function (dhisCode, conceptMapName, callback) {
      async.eachSeries(conceptMapName.group, (groups, nxtGrp) => {
        async.eachSeries(groups.element, (element, nxtElmnt) => {
          if (element.code == dhisCode) {
            element.target.forEach((target) => {
              return callback(target.code)
            })
          } else
            nxtElmnt()
        }, function () {
          nxtGrp()
        })
      }, function () {
        return callback("")
      })
    },

    getDhisDataMapping: function (valuesets, callback) {
      var concept = valuesets.compose.include[0].concept
      var dhisDataMapping = []
      let ages = ["years", "months", "weeks"]
      let ageGroups = []
      //return callback("", require("./delete.json"), require("./delete1.json"))
      async.eachSeries(concept, (dataelement, nextConcept) => {
        winston.info('Translating dataelement ' + dataelement.code)
        this.getCategoryCombo(dataelement.code, (err, catComb) => {
          if (err || catComb == "") {
            return nextConcept()
          }
          this.getCategoryOptionCombo(catComb, (err, catOptCombs) => {
            if (err) {
              return nextConcept()
            }
            let ageGrpFound = false
            async.each(catOptCombs, (catOptComb, nextCatComb) => {
              var catOptCombCode = catOptComb.id
              this.getCategoryOptions(catOptCombCode, (err, catOpt) => {
                if (err) {
                  return nextCatComb()
                }
                // check age grps
                catOpt.forEach(opt => {
                  let oper = catOptOpers.find((oper) => {
                    return oper.code === opt.id
                  })
                  if (oper.dimension.some(dimension => ages.indexOf(dimension) >= 0)) {
                    ageGrpFound = true
                    let ageGrp
                    for (let dimInd in oper.dimension) {
                      if (ageGrp) {
                        ageGrp += ' && ' + oper.operations[dimInd].operation + " " + oper.operations[dimInd].value + " " + oper.dimension[dimInd]
                      } else {
                        ageGrp = oper.operations[dimInd].operation + " " + oper.operations[dimInd].value + " " + oper.dimension[dimInd]
                      }
                    }
                    let exists = ageGroups.find((ageGrp) => {
                      return ageGrp.code === opt.id
                    })
                    if (!exists) {
                      ageGroups.push({
                        code: opt.id,
                        ageGrp
                      })
                    }
                  }
                });
                dhisDataMapping.push({
                  "dataelement": dataelement.code,
                  "catoptcomb": catOptCombCode,
                  "catopts": catOpt
                })
                return nextCatComb()
              })
            }, function () {
              // age grp is not defined in cat options then check if is defined in data element
              if (!ageGrpFound) {
                let oper = dataElementsOpers.find((oper) => {
                  return oper.code === dataelement.code
                })
                if (oper && oper.dimension.some(dimension => ages.indexOf(dimension) >= 0)) {
                  ageGrpFound = true
                  let ageGrp
                  for (let dimInd in oper.dimension) {
                    if (ageGrp) {
                      ageGrp += ' && ' + oper.operations[dimInd].operation + " " + oper.operations[dimInd].value + " " + oper.dimension[dimInd]
                    } else {
                      ageGrp = oper.operations[dimInd].operation + " " + oper.operations[dimInd].value + " " + oper.dimension[dimInd]
                    }
                  }
                  let exists = ageGroups.find((ageGrp) => {
                    return ageGrp.code === dataelement.code
                  })
                  if (!exists) {
                    ageGroups.push({
                      code: dataelement.code,
                      ageGrp
                    })
                  }
                }
              }
              return nextConcept()
            })
          })
        })
      }, function () {
        return callback("", dhisDataMapping, ageGroups)
      })
    },
    getCategoryCombo: function (dataelement, callback) {
      var url = URI(config.url).segment('api/dataElements/' + dataelement)
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
      var options = {
        url: url.toString(),
        headers: {
          Authorization: auth
        }
      }
      request.get(options, (err, res, body) => {
        if (err) {
          winston.error(err)
          return callback(err)
        }
        if (isJSON(body)) {
          var dataElemDet = JSON.parse(body)
          if (!dataElemDet.hasOwnProperty("categoryCombo")) {
            winston.warn("Data Element " + dataelement + " Not found on DHIS2")
            callback(err, "")
          } else
            callback(err, dataElemDet.categoryCombo.id)
        } else {
          winston.error(err)
          winston.error(body)
          winston.warn("Received a non JSON data from DHIS2 while getting Details for data element " + dataelement)
          callback(err, "")
        }
      })
    },

    getCategoryOptionCombo: function (categoryCombo, callback) {
      var url = URI(config.url).segment('api/categoryCombos/' + categoryCombo)
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
      var options = {
        url: url.toString(),
        headers: {
          Authorization: auth
        }
      }
      request.get(options, (err, res, body) => {
        if (err) {
          return callback(err)
        }
        if (!isJSON(body)) {
          winston.error("DHIS2 has retrned non json data")
          err = true
          return callback(err)
        }
        callback(err, JSON.parse(body).categoryOptionCombos)
      })
    },

    getCategoryOptions: function (categoryOptionCombo, callback) {
      var url = URI(config.url).segment('api/categoryOptionCombos/' + categoryOptionCombo)
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
      var options = {
        url: url.toString(),
        headers: {
          Authorization: auth
        }
      }
      request.get(options, (err, res, body) => {
        if (err) {
          return callback(err)
        }
        if (!isJSON(body)) {
          winston.error("DHIS2 has retrned non json data")
          err = true
          return callback(err)
        }
        callback(err, JSON.parse(body).categoryOptions)
      })
    },
    populateImmunizationValues: function ({
      period,
      facData,
      dataValues,
      ageGrpCode,
      dhisDataMapping,
      dhis2FacilityId
    }, callback) {
      async.each(dhisDataMapping, (mapping, nxtMapping) => {
        this.getTimrCode(mapping.dataelement, immunizationConcMap, (timrVaccineCode) => {
          let ageGrpExist = mapping.catopts.find((catOpt) => {
            return catOpt.id === ageGrpCode
          })
          // if age grp is not defined under cat opts then check if its defined in dataelement
          if (!ageGrpExist && mapping.dataelement === ageGrpCode) {
            ageGrpExist = true
          }
          if (!ageGrpExist && ageGrpCode) {
            return nxtMapping()
          }
          let ages = ["years", "months", "weeks"]
          let gender, dose, incatchment
          for (let catopt of mapping.catopts) {
            let catOptOper = catOptOpers.find((oper) => {
              return oper.code === catopt.id
            })

            for (let dimInd in catOptOper.dimension) {
              let dimension = catOptOper.dimension[dimInd]
              if (ages.includes(dimension)) {
                continue
              }
              if (dimension === 'gender') {
                gender = catOptOper.operations[dimInd].value.toLowerCase()
              } else if (dimension === 'dose-sequence') {
                dose = catOptOper.operations[dimInd].value
              } else if (dimension === 'in-catchment') {
                incatchment = catOptOper.operations[dimInd].value
              }
            }
          }

          let values
          // BCG has no dose
          if (mapping.dataelement === 'Q2fFmlGkxRN') {
            values = facData.filter((data) => {
              return data.gender_mnemonic.toLowerCase() == gender && data.type_mnemonic == timrVaccineCode
            })
          } // IPV and ROTA has dose 1 only
          else if (mapping.dataelement === 'w3flvyXod5d' || mapping.dataelement === 'IneV6eRU9fu') {
            values = facData.filter((data) => {
              return data.gender_mnemonic.toLowerCase() == gender && data.seq_id == 1 && data.type_mnemonic == timrVaccineCode
            })
          } //ROTA 10-32 weeks of age is fixed to dose 2
          else if(mapping.dataelement === 'fMzRNxplkxA') {
            values = facData.filter((data) => {
              return data.gender_mnemonic.toLowerCase() == gender && data.seq_id == 2 && data.type_mnemonic == timrVaccineCode
            })
          } else {
            values = facData.filter((data) => {
              return data.gender_mnemonic.toLowerCase() == gender && data.seq_id == dose && data.type_mnemonic == timrVaccineCode
            })
          }
          let total = 0
          if (values && incatchment == 'True') {
            for (let value of values) {
              total += parseInt(value.in_service_area)
            }
          } else if (values && incatchment == 'False') {
            for (let value of values) {
              total += parseInt(value.in_catchment)
            }
          }
          if (total) {
            dataValues.push({
              'attributeOptionCombo': 'uGIJ6IdkP7Q',
              'dataElement': mapping.dataelement,
              'categoryOptionCombo': mapping.catoptcomb,
              'period': period,
              'orgUnit': dhis2FacilityId,
              'value': `${total}`
            })
          }
          return nxtMapping()
        })
      }, () => {
        return callback()
      })
    },

    populateSupplementsValues: function ({
      period,
      facData,
      dataValues,
      ageGrpCode,
      dhisDataMapping,
      dhis2FacilityId
    }, callback) {
      async.each(dhisDataMapping, (mapping, nxtMapping) => {
        this.getTimrCode(mapping.dataelement, supplementsConcMap, (timrVaccineCode) => {
          let ageGrpExist = mapping.catopts.find((catOpt) => {
            return catOpt.id === ageGrpCode
          })
          // if age grp is not defined under cat opts then check if its defined in dataelement
          if (!ageGrpExist && mapping.dataelement === ageGrpCode) {
            ageGrpExist = true
          }
          if (!ageGrpExist && ageGrpCode) {
            return nxtMapping()
          }
          let ages = ["years", "months", "weeks"]
          let gender
          for (let catopt of mapping.catopts) {
            let catOptOper = catOptOpers.find((oper) => {
              return oper.code === catopt.id
            })

            for (let dimInd in catOptOper.dimension) {
              let dimension = catOptOper.dimension[dimInd]
              if (ages.includes(dimension)) {
                continue
              }
              if (dimension === 'gender') {
                gender = catOptOper.operations[dimInd].value.toLowerCase()
              }
            }
          }
          let values = facData.find((data) => {
            return data.gender_mnemonic.toLowerCase() == gender && data.code == timrVaccineCode
          })
          if (values) {
            dataValues.push({
              'attributeOptionCombo': 'uGIJ6IdkP7Q',
              'dataElement': mapping.dataelement,
              'categoryOptionCombo': mapping.catoptcomb,
              'period': period,
              'orgUnit': dhis2FacilityId,
              'value': values.total
            })
          }
          return nxtMapping()
        })
      }, () => {
        return callback()
      })
    },

    populateBreastFeedingValues: function ({
      period,
      facData,
      dataValues,
      dhisDataMapping,
      dhis2FacilityId
    }, callback) {
      async.each(dhisDataMapping, (mapping, nxtMapping) => {
        this.getTimrCode(mapping.dataelement, breastFeedConcMap, (timrVaccineCode) => {
          let gender
          for (let catopt of mapping.catopts) {
            let catOptOper = catOptOpers.find((oper) => {
              return oper.code === catopt.id
            })

            for (let dimInd in catOptOper.dimension) {
              let dimension = catOptOper.dimension[dimInd]
              if (dimension === 'gender') {
                gender = catOptOper.operations[dimInd].value.toLowerCase()
              }
            }
          }
          let values = facData.find((data) => {
            return data.gender_mnemonic.toLowerCase() == gender && data.ext_value == timrVaccineCode
          })
          if (values) {
            dataValues.push({
              'attributeOptionCombo': 'uGIJ6IdkP7Q',
              'dataElement': mapping.dataelement,
              'categoryOptionCombo': mapping.catoptcomb,
              'period': period,
              'orgUnit': dhis2FacilityId,
              'value': values.total
            })
          }
          return nxtMapping()
        })
      }, () => {
        return callback()
      })
    },

    populatePMTCTValues: function ({
      period,
      facData,
      dataValues,
      dhisDataMapping,
      dhis2FacilityId
    }, callback) {
      async.each(dhisDataMapping, (mapping, nxtMapping) => {
        let gender
        for (let catopt of mapping.catopts) {
          let catOptOper = catOptOpers.find((oper) => {
            return oper.code === catopt.id
          })

          for (let dimInd in catOptOper.dimension) {
            let dimension = catOptOper.dimension[dimInd]
            if (dimension === 'gender') {
              gender = catOptOper.operations[dimInd].value.toLowerCase()
            }
          }
        }

        let values = facData.find((data) => {
          return data.gender_mnemonic.toLowerCase() == gender
        })
        if (values) {
          dataValues.push({
            'attributeOptionCombo': 'uGIJ6IdkP7Q',
            'dataElement': mapping.dataelement,
            'categoryOptionCombo': mapping.catoptcomb,
            'period': period,
            'orgUnit': dhis2FacilityId,
            'value': values.total
          })
        }
        return nxtMapping()
      }, () => {
        return callback()
      })
    },

    populateCTCValues: function ({
      period,
      facData,
      dataValues,
      dhisDataMapping,
      dhis2FacilityId
    }, callback) {
      async.each(dhisDataMapping, (mapping, nxtMapping) => {
        let gender
        for (let catopt of mapping.catopts) {
          let catOptOper = catOptOpers.find((oper) => {
            return oper.code === catopt.id
          })

          for (let dimInd in catOptOper.dimension) {
            let dimension = catOptOper.dimension[dimInd]
            if (dimension === 'gender') {
              gender = catOptOper.operations[dimInd].value.toLowerCase()
            }
          }
        }

        let values = facData.find((data) => {
          return data.gender_mnemonic.toLowerCase() == gender
        })
        if (values) {
          dataValues.push({
            'attributeOptionCombo': 'uGIJ6IdkP7Q',
            'dataElement': mapping.dataelement,
            'categoryOptionCombo': mapping.catoptcomb,
            'period': period,
            'orgUnit': dhis2FacilityId,
            'value': values.total
          })
        }
        return nxtMapping()
      }, () => {
        return callback()
      })
    },
    populateLLINMosqNetValues: function ({
      period,
      facData,
      dataValues,
      dhisDataMapping,
      dhis2FacilityId
    }, callback) {
      async.each(dhisDataMapping, (mapping, nxtMapping) => {
        let gender
        for (let catopt of mapping.catopts) {
          let catOptOper = catOptOpers.find((oper) => {
            return oper.code === catopt.id
          })

          for (let dimInd in catOptOper.dimension) {
            let dimension = catOptOper.dimension[dimInd]
            if (dimension === 'gender') {
              gender = catOptOper.operations[dimInd].value.toLowerCase()
            }
          }
        }

        let values = facData.find((data) => {
          return data.gender_mnemonic.toLowerCase() == gender
        })
        if (values) {
          dataValues.push({
            'attributeOptionCombo': 'uGIJ6IdkP7Q',
            'dataElement': mapping.dataelement,
            'categoryOptionCombo': mapping.catoptcomb,
            'period': period,
            'orgUnit': dhis2FacilityId,
            'value': values.total
          })
        }
        return nxtMapping()
      }, () => {
        return callback()
      })
    },

    populateWeightAgeRatioValues: function ({
      period,
      facData,
      dataValues,
      ageGrpCode,
      dhisDataMapping,
      dhis2FacilityId
    }, callback) {
      async.each(dhisDataMapping, (mapping, nxtMapping) => {
        let ageGrpExist = mapping.catopts.find((catOpt) => {
          return catOpt.id === ageGrpCode
        })
        // if age grp is not defined under cat opts then check if its defined in dataelement
        if (!ageGrpExist && mapping.dataelement === ageGrpCode) {
          ageGrpExist = true
        }
        if (!ageGrpExist && ageGrpCode) {
          return nxtMapping()
        }
        let ages = ["years", "months", "weeks"]
        let gender, ratio
        for (let catopt of mapping.catopts) {
          let catOptOper = catOptOpers.find((oper) => {
            return oper.code === catopt.id
          })

          for (let dimInd in catOptOper.dimension) {
            let dimension = catOptOper.dimension[dimInd]
            if (ages.includes(dimension)) {
              continue
            }
            if (dimension === 'gender') {
              gender = catOptOper.operations[dimInd].value.toLowerCase()
            } else if (dimension === 'interpretation') {
              ratio = catOptOper.operations[dimInd].value
            }
          }
        }

        let values = facData.find((data) => {
          return data.gender_mnemonic.toLowerCase() == gender && data.code == ratio
        })
        if (values) {
          dataValues.push({
            'attributeOptionCombo': 'uGIJ6IdkP7Q',
            'dataElement': mapping.dataelement,
            'categoryOptionCombo': mapping.catoptcomb,
            'period': period,
            'orgUnit': dhis2FacilityId,
            'value': values.total
          })
        }
        return nxtMapping()
      }, () => {
        return callback()
      })
    },

    populateChildVisitValues: function ({
      period,
      facData,
      dataValues,
      ageGrpCode,
      dhisDataMapping,
      dhis2FacilityId
    }, callback) {
      async.each(dhisDataMapping, (mapping, nxtMapping) => {
        let ageGrpExist = mapping.catopts.find((catOpt) => {
          return catOpt.id === ageGrpCode
        })
        // if age grp is not defined under cat opts then check if its defined in dataelement
        if (!ageGrpExist && mapping.dataelement === ageGrpCode) {
          ageGrpExist = true
        }
        if (!ageGrpExist && ageGrpCode) {
          return nxtMapping()
        }
        let gender
        for (let catopt of mapping.catopts) {
          let catOptOper = catOptOpers.find((oper) => {
            return oper.code === catopt.id
          })

          for (let dimInd in catOptOper.dimension) {
            let dimension = catOptOper.dimension[dimInd]
            if (dimension === 'gender') {
              gender = catOptOper.operations[dimInd].value.toLowerCase()
            }
          }
        }

        let values = facData.find((data) => {
          return data.gender_mnemonic.toLowerCase() == gender
        })
        if (values) {
          dataValues.push({
            'attributeOptionCombo': 'uGIJ6IdkP7Q',
            'dataElement': mapping.dataelement,
            'categoryOptionCombo': mapping.catoptcomb,
            'period': period,
            'orgUnit': dhis2FacilityId,
            'value': values.total
          })
        }
        return nxtMapping()
      }, () => {
        return callback()
      })
    },

    populateTTValues: function ({
      period,
      facData,
      dataValues,
      dhisDataMapping,
      dhis2FacilityId
    }, callback) {
      async.each(dhisDataMapping, (mapping, nxtMapping) => {
        this.getTimrCode(mapping.dataelement, TTConcMap, (timrItemCode) => {
          let gender
          for (let catopt of mapping.catopts) {
            let catOptOper = catOptOpers.find((oper) => {
              return oper.code === catopt.id
            })

            for (let dimInd in catOptOper.dimension) {
              let dimension = catOptOper.dimension[dimInd]
              if (dimension === 'gender') {
                gender = catOptOper.operations[dimInd].value.toLowerCase()
              }
            }
          }

          let values = facData.find((data) => {
            return data.gender_mnemonic.toLowerCase() == gender && data.ext_value == timrItemCode
          })
          if (values) {
            dataValues.push({
              'attributeOptionCombo': 'uGIJ6IdkP7Q',
              'dataElement': mapping.dataelement,
              'categoryOptionCombo': mapping.catoptcomb,
              'period': period,
              'orgUnit': dhis2FacilityId,
              'value': values.total
            })
          }
          return nxtMapping()
        })
      }, () => {
        return callback()
      })
    },
    /**
     *
     * @param {Array} dataValues
     */
    saveBulkData: function (dataValues, orchestrations) {
      var url = URI(config.url).segment('api/dataValueSets')
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
      var reqBody = {
        "dataValues": dataValues
      }
      winston.info("Saving " + reqBody.dataValues.length + " Data Values")
      var options = {
        url: url.toString(),
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth
        },
        json: reqBody
      }
      let before = new Date()
      request.post(options, function (err, res, body) {
        winston.error(JSON.stringify(body, 0, 2))
        if (err) {
          winston.error(err)
        }
        orchestrations.push(utils.buildOrchestration('Saving Immunization Data To DHIS2', before, 'POST', url.toString(), JSON.stringify(reqBody), res, JSON.stringify(body)))
      })
    },

    saveDHISData: function (dataElement, catOptCombo, orgCode, value, orchestrations, callback) {
      var period = moment().subtract(1, 'months').format('YYYYMM')
      var url = URI(config.url).segment('api/dataValueSets')
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
      var reqBody = {
        "dataValues": [{
          'dataElement': dataElement,
          'categoryOptionCombo': catOptCombo,
          'period': period,
          'orgUnit': orgCode,
          'value': value
        }]
      }
      winston.info("Saving " + JSON.stringify(reqBody))
      var options = {
        url: url.toString(),
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth
        },
        json: reqBody
      }
      let before = new Date()
      request.post(options, function (err, res, body) {
        orchestrations.push(utils.buildOrchestration('Saving Immunization Data To DHIS2', before, 'POST', url.toString(), JSON.stringify(reqBody), res, JSON.stringify(body)))
        if (err) {
          return callback(err)
        }
        callback(null, res, body)
      })
    }
  }
}