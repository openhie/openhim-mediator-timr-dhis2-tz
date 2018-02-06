#!/usr/bin/env node
'use strict'

const express = require('express')
const medUtils = require('openhim-mediator-utils')
const winston = require('winston')
const moment = require("moment")
const request = require('request')
const async = require('async')
const TImR = require('./timr')
const DHIS2 = require('./dhis2')
const OIM = require('./openinfoman')
const utils = require('./utils')
const imm_valuesets = require('./terminologies/dhis-immunization-valuesets.json')
const suppl_valuesets = require('./terminologies/dhis-supplements-valuesets.json')
const breastfeed_valuesets = require('./terminologies/dhis-breastfeeding-valuesets.json')
const pmtct_valuesets = require('./terminologies/dhis-pmtct-valuesets.json')
const mosquitonet_valuesets = require('./terminologies/dhis-mosquitonet-valuesets.json')
const weightAgeRatio_valuesets = require('./terminologies/dhis-weight_age_ratio-valuesets.json')
const childvisit_valuesets = require('./terminologies/dhis-childvisit-valuesets.json')
const TT_valuesets = require('./terminologies/dhis-TT-valuesets.json')

// Config
var config = {} // this will vary depending on whats set in openhim-core
const apiConf = require('./config/config')
const mediatorConfig = require('./config/mediator')

// socket config - large documents can cause machine to max files open
const https = require('https')
const http = require('http')

https.globalAgent.maxSockets = 32
http.globalAgent.maxSockets = 32

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

// Logging setup
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'info', timestamp: true, colorize: true})

/**
 * setupApp - configures the http server for this mediator
 *
 * @return {express.App}  the configured http server
 */
function setupApp () {
  const app = express()

  function updateTransaction (req,body,statatusText,statusCode,orchestrations) {
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
        json:update
      }

      request.put(options, function(err, apiRes, body) {
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

  app.get('/syncImmunizationCoverage', (req, res) => {
    const timr = TImR(config.timr,config.timrOauth2)
    const dhis2 = DHIS2(config.dhis2)
    const oim = OIM(config.openinfoman)
    res.end()
    updateTransaction (req,"Still Processing","Processing","200","")
    req.timestamp = new Date()
    let orchestrations = []
    var LAST_MONTH = moment().subtract(1,'months').format('YYYYMM')
    winston.info("Translating DHIS2 Data Elements")
    dhis2.getDhisDataMapping(imm_valuesets,(err,dhisDataMapping) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info("Get DHIS2 Facilities From Openinfoman")
      oim.getDHIS2Facilities(orchestrations,(facilities)=>{
        async.eachSeries(facilities,(facility,nextFacility)=>{
          var dhis2FacilityId = facility.dhis2FacilityId
          var timrFacilityId = facility.timrFacilityId
          var facilityName = facility.facilityName
          var processed = dhisDataMapping.length
          winston.info("Processing Immunization Data for " + facilityName)
          winston.info(dhisDataMapping.length + " CatOptComb Found")
          winston.info('Getting Access Token From TImR')
          timr.getAccessToken(orchestrations,(err, res, body) => {
            if(err) {
              winston.error("An error occured while getting access token from TImR")
              return nextFacility()
            }
            var access_token = JSON.parse(body).access_token
            winston.info(`Fetching Immunization Data From ${config.timr.url}`)
            async.eachOfSeries(dhisDataMapping,(dhisData,index,nextDataMapping)=>{
              timr.getImmunizationData(access_token,dhisData,timrFacilityId,orchestrations,(err,value,url) => {
                if(err) {
                  winston.error(err)
                  return nextDataMapping()
                }
                var dataelement = dhisData.dataelement
                var catoptcomb = dhisData.catoptcomb
                if(value > 0) {
                  dhis2.saveDHISData(dataelement,catoptcomb,LAST_MONTH,dhis2FacilityId,value,orchestrations,(err,res,body) => {
                    winston.info("CatOptComb " + (Number(index) + 1) + "/" + dhisDataMapping.length + " Total===>"+value+" CatOptComb===>" + " "+JSON.stringify(body))
                    return nextDataMapping()
                  })
                }
                else {
                  winston.info("CatOptComb " + (Number(index) + 1) + "/" + dhisDataMapping.length + " Processed With " + value + " Records")
                  return nextDataMapping()
                }
              })
            },function(){
              winston.info('Done Processing ' + facilityName)
              nextFacility()
            })
          })
        },function(){
          winston.info('Done Synchronizing Immunization Coverage!!!')
          updateTransaction(req,"","Successful","200",orchestrations)
        })
      })
    })
  }),

  app.get('/syncSupplements', (req, res) => {
    const timr = TImR(config.timr,config.timrOauth2)
    const dhis2 = DHIS2(config.dhis2)
    const oim = OIM(config.openinfoman)
    res.end()
    updateTransaction (req,"Still Processing","Processing","200","")
    req.timestamp = new Date()
    let orchestrations = []
    var LAST_MONTH = moment().subtract(1,'months').format('YYYYMM')
    winston.info("Translating DHIS2 Data Elements")
    dhis2.getDhisDataMapping(suppl_valuesets,(err,dhisDataMapping) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info("Get DHIS2 Facilities From Openinfoman")
      oim.getDHIS2Facilities(orchestrations,(facilities)=>{
        async.eachSeries(facilities,(facility,nextFacility)=>{
          var dhis2FacilityId = facility.dhis2FacilityId
          var timrFacilityId = facility.timrFacilityId
          var facilityName = facility.facilityName
          var processed = dhisDataMapping.length
          winston.info("Processing Supplements Data for " + facilityName)
          winston.info(dhisDataMapping.length + " CatOptComb Found")
          winston.info('Getting Access Token From TImR')
          timr.getAccessToken(orchestrations,(err, res, body) => {
            var access_token = JSON.parse(body).access_token
            winston.info(`Fetching Supplements Data From ${config.timr.url}`)
            dhisDataMapping.forEach((dhisData,index) => {
              timr.getSupplementsData(access_token,dhisData,timrFacilityId,orchestrations,(err,value,url) => {
                if(err)
                winston.error(err)
                var dataelement = dhisData.dataelement
                var catoptcomb = dhisData.catoptcomb
                if(value > 0) {
                  processed--
                  dhis2.saveDHISData(dataelement,catoptcomb,LAST_MONTH,dhis2FacilityId,value,orchestrations,(err,res,body) => {
                    winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Total===>"+value+" CatOptComb===>" + " "+JSON.stringify(body))
                  })
                }
                else {
                  processed--
                  winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Processed With " + value + " Records")
                }
                if(processed == 0) {
                  winston.info('Done Processing ' + facilityName)
                  nextFacility()
                }
              })
            })
          })
        },function(){
          winston.info('Done Synchronizing Supplements Data!!!')
          updateTransaction(req,"","Successful","200",orchestrations)
        })
      })
    })
  })

  app.get('/syncBreastFeeding', (req, res) => {
    const timr = TImR(config.timr,config.timrOauth2)
    const dhis2 = DHIS2(config.dhis2)
    const oim = OIM(config.openinfoman)
    res.end()
    updateTransaction (req,"Still Processing","Processing","200","")
    req.timestamp = new Date()
    let orchestrations = []
    var LAST_MONTH = moment().subtract(1,'months').format('YYYYMM')
    winston.info("Translating DHIS2 Breast Feeding Data Elements")
    dhis2.getDhisDataMapping(breastfeed_valuesets,(err,dhisDataMapping) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info("Get DHIS2 Facilities From Openinfoman")
      oim.getDHIS2Facilities(orchestrations,(facilities)=>{
        async.eachSeries(facilities,(facility,nextFacility)=>{
          var dhis2FacilityId = facility.dhis2FacilityId
          var timrFacilityId = facility.timrFacilityId
          var facilityName = facility.facilityName
          var processed = dhisDataMapping.length
          winston.info("Processing Breastfeeding Data for " + facilityName)
          winston.info(dhisDataMapping.length + " CatOptComb Found")
          winston.info('Getting Access Token From TImR')
          timr.getAccessToken(orchestrations,(err, res, body) => {
            var access_token = JSON.parse(body).access_token
            dhisDataMapping.forEach((dhisData,index) => {
              timr.getBreastFeedData(access_token,dhisData,timrFacilityId,orchestrations,(err,value,url) => {
                if(err)
                winston.error(err)
                var dataelement = dhisData.dataelement
                var catoptcomb = dhisData.catoptcomb
                if(value >= 0) {
                  processed--
                  dhis2.saveDHISData(dataelement,catoptcomb,LAST_MONTH,dhis2FacilityId,value,orchestrations,(err,res,body) => {
                    winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Total===>"+value+" CatOptComb===>" + " "+JSON.stringify(body))
                  })
                }
                else {
                  processed--
                  winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Processed With " + value + " Records")
                }
                if(processed == 0) {
                  winston.info('Done Processing ' + facilityName)
                  return nextFacility()
                }
              })
            })
          })
        },function(){
          winston.info('Done Synchronizing Breast Feeding Data!!!')
          updateTransaction(req,"","Successful","200",orchestrations)
        })
      })
    })
  })

  app.get('/syncPMTCT', (req, res) => {
    const timr = TImR(config.timr,config.timrOauth2)
    const dhis2 = DHIS2(config.dhis2)
    const oim = OIM(config.openinfoman)
    res.end()
    updateTransaction (req,"Still Processing","Processing","200","")
    req.timestamp = new Date()
    let orchestrations = []
    var LAST_MONTH = moment().subtract(1,'months').format('YYYYMM')
    winston.info("Translating DHIS2 PMTCT Data Elements")
    dhis2.getDhisDataMapping(pmtct_valuesets,(err,dhisDataMapping) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info("Get DHIS2 Facilities From Openinfoman")
      oim.getDHIS2Facilities(orchestrations,(facilities)=>{
        async.eachSeries(facilities,(facility,nextFacility)=>{
          var dhis2FacilityId = facility.dhis2FacilityId
          var timrFacilityId = facility.timrFacilityId
          var facilityName = facility.facilityName
          var processed = dhisDataMapping.length
          winston.info("Processing PMTCT Data for " + facilityName)
          winston.info(dhisDataMapping.length + " CatOptComb Found")
          winston.info('Getting Access Token From TImR')
          timr.getAccessToken(orchestrations,(err, res, body) => {
            var access_token = JSON.parse(body).access_token
            dhisDataMapping.forEach((dhisData,index) => {
              timr.getPMTCTData(access_token,dhisData,timrFacilityId,orchestrations,(err,value,url) => {
                if(err)
                winston.error(err)
                var dataelement = dhisData.dataelement
                var catoptcomb = dhisData.catoptcomb
                if(value > 0) {
                  processed--
                  dhis2.saveDHISData(dataelement,catoptcomb,LAST_MONTH,dhis2FacilityId,value,orchestrations,(err,res,body) => {
                    winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Total===>"+value+" CatOptComb===>" + " "+JSON.stringify(body))
                  })
                }
                else {
                  processed--
                  winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Processed With " + value + " Records")
                }
                if(processed == 0) {
                  winston.info('Done Processing ' + facilityName)
                  return nextFacility()
                }
              })
            })
          })
        },function(){
          winston.info('Done Synchronizing PMTCT Data!!!')
          updateTransaction(req,"","Successful","200",orchestrations)
        })
      })
    })
  })

  app.get('/syncMosquitoNet', (req, res) => {
    const timr = TImR(config.timr,config.timrOauth2)
    const dhis2 = DHIS2(config.dhis2)
    const oim = OIM(config.openinfoman)
    res.end()
    updateTransaction (req,"Still Processing","Processing","200","")
    req.timestamp = new Date()
    let orchestrations = []
    var LAST_MONTH = moment().subtract(1,'months').format('YYYYMM')
    winston.info("Translating DHIS2 Mosquito Net Data Elements")
    dhis2.getDhisDataMapping(mosquitonet_valuesets,(err,dhisDataMapping) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info("Get DHIS2 Facilities From Openinfoman")
      oim.getDHIS2Facilities(orchestrations,(facilities)=>{
        async.eachSeries(facilities,(facility,nextFacility)=>{
          var dhis2FacilityId = facility.dhis2FacilityId
          var timrFacilityId = facility.timrFacilityId
          var facilityName = facility.facilityName
          var processed = dhisDataMapping.length
          winston.info("Processing Mosquito Net Data for " + facilityName)
          winston.info(dhisDataMapping.length + " CatOptComb Found")
          winston.info('Getting Access Token From TImR')
          timr.getAccessToken(orchestrations,(err, res, body) => {
            var access_token = JSON.parse(body).access_token
            dhisDataMapping.forEach((dhisData,index) => {
              timr.getMosquitoNetData(access_token,dhisData,timrFacilityId,orchestrations,(err,value,url) => {
                if(err)
                winston.error(err)
                var dataelement = dhisData.dataelement
                var catoptcomb = dhisData.catoptcomb
                if(value > 0) {
                  processed--
                  dhis2.saveDHISData(dataelement,catoptcomb,LAST_MONTH,dhis2FacilityId,value,orchestrations,(err,res,body) => {
                    winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Total===>"+value+" CatOptComb===>" + " "+JSON.stringify(body))
                  })
                }
                else {
                  processed--
                  winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Processed With " + value + " Records")
                }
                if(processed == 0) {
                  winston.info('Done Processing ' + facilityName)
                  return nextFacility()
                }
              })
            })
          })
        },function(){
          winston.info('Done Synchronizing PMTCT Data!!!')
          updateTransaction(req,"","Successful","200",orchestrations)
        })
      })
    })
  })

  app.get('/syncWeightAgeRatio', (req, res) => {
    const timr = TImR(config.timr,config.timrOauth2)
    const dhis2 = DHIS2(config.dhis2)
    const oim = OIM(config.openinfoman)
    res.end()
    updateTransaction (req,"Still Processing","Processing","200","")
    req.timestamp = new Date()
    let orchestrations = []
    var LAST_MONTH = moment().subtract(1,'months').format('YYYYMM')
    winston.info("Translating DHIS2 Weight Age Ratio Data Elements")
    dhis2.getDhisDataMapping(weightAgeRatio_valuesets,(err,dhisDataMapping) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info("Get DHIS2 Facilities From Openinfoman")
      oim.getDHIS2Facilities(orchestrations,(facilities)=>{
        async.eachSeries(facilities,(facility,nextFacility)=>{
          var dhis2FacilityId = facility.dhis2FacilityId
          var timrFacilityId = facility.timrFacilityId
          var facilityName = facility.facilityName
          var processed = dhisDataMapping.length
          winston.info("Processing Weight Age Ratio Data for " + facilityName)
          winston.info(dhisDataMapping.length + " CatOptComb Found")
          winston.info('Getting Access Token From TImR')
          timr.getAccessToken(orchestrations,(err, res, body) => {
            var access_token = JSON.parse(body).access_token
            dhisDataMapping.forEach((dhisData,index) => {
              timr.getWeightAgeRatioData(access_token,dhisData,timrFacilityId,orchestrations,(err,value,url) => {
                if(err)
                winston.error(err)
                var dataelement = dhisData.dataelement
                var catoptcomb = dhisData.catoptcomb
                if(value > 0) {
                  processed--
                  dhis2.saveDHISData(dataelement,catoptcomb,LAST_MONTH,dhis2FacilityId,value,orchestrations,(err,res,body) => {
                    winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Total===>"+value+" CatOptComb===>" + " "+JSON.stringify(body))
                  })
                }
                else {
                  processed--
                  winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Processed With " + value + " Records")
                }
                if(processed == 0) {
                  winston.info('Done Processing ' + facilityName)
                  return nextFacility()
                }
              })
            })
          })
        },function(){
          winston.info('Done Synchronizing Weight Age Ratio Data!!!')
          updateTransaction(req,"","Successful","200",orchestrations)
        })
      })
    })
  })

  app.get('/syncChildVisit', (req, res) => {
    const timr = TImR(config.timr,config.timrOauth2)
    const dhis2 = DHIS2(config.dhis2)
    const oim = OIM(config.openinfoman)
    res.end()
    updateTransaction (req,"Still Processing","Processing","200","")
    req.timestamp = new Date()
    let orchestrations = []
    var LAST_MONTH = moment().subtract(1,'months').format('YYYYMM')
    winston.info("Translating DHIS2 Weight Age Ratio Data Elements")
    dhis2.getDhisDataMapping(childvisit_valuesets,(err,dhisDataMapping) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info("Get DHIS2 Facilities From Openinfoman")
      oim.getDHIS2Facilities(orchestrations,(facilities)=>{
        async.eachSeries(facilities,(facility,nextFacility)=>{
          var dhis2FacilityId = facility.dhis2FacilityId
          var timrFacilityId = facility.timrFacilityId
          var facilityName = facility.facilityName
          var processed = dhisDataMapping.length
          winston.info("Processing Child Visit Data for " + facilityName)
          winston.info(dhisDataMapping.length + " CatOptComb Found")
          winston.info('Getting Access Token From TImR')
          timr.getAccessToken(orchestrations,(err, res, body) => {
            var access_token = JSON.parse(body).access_token
            dhisDataMapping.forEach((dhisData,index) => {
              timr.getChildVisitData(access_token,dhisData,timrFacilityId,orchestrations,(err,value,url) => {
                if(err)
                winston.error(err)
                var dataelement = dhisData.dataelement
                var catoptcomb = dhisData.catoptcomb
                if(value > 0) {
                  processed--
                  dhis2.saveDHISData(dataelement,catoptcomb,LAST_MONTH,dhis2FacilityId,value,orchestrations,(err,res,body) => {
                    winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Total===>"+value+" CatOptComb===>" + " "+JSON.stringify(body))
                  })
                }
                else {
                  processed--
                  winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Processed With " + value + " Records")
                }
                if(processed == 0) {
                  winston.info('Done Processing ' + facilityName)
                  return nextFacility()
                }
              })
            })
          })
        },function(){
          winston.info('Done Synchronizing Child Visit Data Data!!!')
          updateTransaction(req,"","Successful","200",orchestrations)
        })
      })
    })
  })

  app.get('/syncTT', (req, res) => {
    const timr = TImR(config.timr,config.timrOauth2)
    const dhis2 = DHIS2(config.dhis2)
    const oim = OIM(config.openinfoman)
    res.end()
    updateTransaction (req,"Still Processing","Processing","200","")
    req.timestamp = new Date()
    let orchestrations = []
    var LAST_MONTH = moment().subtract(1,'months').format('YYYYMM')
    winston.info("Translating DHIS2 TT Data Elements")
    dhis2.getDhisDataMapping(TT_valuesets,(err,dhisDataMapping) => {
      winston.info("Done Translating DHIS2 Data Elements")
      winston.info("Get DHIS2 Facilities From Openinfoman")
      oim.getDHIS2Facilities(orchestrations,(facilities)=>{
        async.eachSeries(facilities,(facility,nextFacility)=>{
          var dhis2FacilityId = facility.dhis2FacilityId
          var timrFacilityId = facility.timrFacilityId
          var facilityName = facility.facilityName
          var processed = dhisDataMapping.length
          winston.info("Processing TT Data for " + facilityName)
          winston.info(dhisDataMapping.length + " CatOptComb Found")
          winston.info('Getting Access Token From TImR')
          timr.getAccessToken(orchestrations,(err, res, body) => {
            var access_token = JSON.parse(body).access_token
            dhisDataMapping.forEach((dhisData,index) => {
              timr.getTTData(access_token,dhisData,timrFacilityId,orchestrations,(err,value,url) => {
                if(err) {
                  winston.error(err)
                }
                var dataelement = dhisData.dataelement
                var catoptcomb = dhisData.catoptcomb
                if(value >= 0) {
                  processed--
                  dhis2.saveDHISData(dataelement,catoptcomb,LAST_MONTH,dhis2FacilityId,value,orchestrations,(err,res,body) => {
                    winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Total===>"+value+" CatOptComb===>" + " "+JSON.stringify(body))
                  })
                }
                else {
                  processed--
                  winston.info("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Processed With " + value + " Records")
                }
                if(processed == 0) {
                  winston.info('Done Processing ' + facilityName)
                  return nextFacility()
                }
              })
            })
          })
        },function(){
          winston.info('Done Synchronizing TT Data Data!!!')
          updateTransaction(req,"","Successful","200",orchestrations)
        })
      })
    })
  })

  return app
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function start (callback) {
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
        if (err) {
          winston.info('Failed to fetch initial config')
          winston.info(err.stack)
          process.exit(1)
        } else {
          winston.info('Successfully registered mediator!')
          let app = setupApp()
          const server = app.listen(9001, () => {
            let configEmitter = medUtils.activateHeartbeat(apiConf.api)
            configEmitter.on('config', (newConfig) => {
              winston.info('Received updated config:', newConfig)
              // set new config for mediator
              config = newConfig
            })
            callback(server)
          })
        }
      })
    })
  } else {
    // default to config from mediator registration
    config = mediatorConfig.config
    let app = setupApp()
    const server = app.listen(9001, () => callback(server))
  }
}
exports.start = start

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => winston.info('Listening on 9001...'))
}
