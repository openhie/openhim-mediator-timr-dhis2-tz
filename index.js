#!/usr/bin/env node
'use strict'

const express = require('express')
const medUtils = require('openhim-mediator-utils')
const winston = require('winston')
const moment = require("moment")
const TImR = require('./timr')
const DHIS2 = require('./dhis2')
// Config
var config = {} // this will vary depending on whats set in openhim-core
const apiConf = require('./config/config')
const mediatorConfig = require('./config/mediator')

// socket config - large documents can cause machine to max files open
const https = require('https')
const http = require('http')

https.globalAgent.maxSockets = 10
http.globalAgent.maxSockets = 10

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

  app.get('/sync', (req, res) => {
    const timr = TImR(config.timr,config.timrOauth2)
    const dhis2 = DHIS2(config.dhis2)
    req.timestamp = new Date()
    let orchestrations = []

    function reportFailure (err, req) {
      res.writeHead(500, { 'Content-Type': 'application/json+openhim' })
      winston.error(err.stack)
      winston.error('Something went wrong, relaying error to OpenHIM-core')
      let response = JSON.stringify({
        'x-mediator-urn': mediatorConfig.urn,
        status: 'Failed',
        request: {
          method: req.method,
          headers: req.headers,
          timestamp: req.timestamp,
          path: req.path
        },
        response: {
          status: 500,
          body: err.stack,
          timestamp: new Date()
        },
        orchestrations: orchestrations
      })
      res.end(response)
    }
    var LAST_MONTH = moment().subtract(1,'months').format('YYYYMM')
    dhis2.getDhisDataMapping((err, dhisDataMapping) => {
      timr.getAccessToken((err, res, body) => {
        winston.info(`Fetching Immunization Data From ${config.timr.url}`)
        winston.error(dhisDataMapping.length + " CatOptComb Found")
        dhisDataMapping.forEach((dhisData,index) => {
          var facilityid = "urn:uuid:121DF9A7-3C9E-371A-89FF-CE0C0F1B9F4F"//(This ID is for Valeska) need to loop through all facilities
          timr.getImmunizationData(JSON.parse(body).access_token,dhisData,facilityid, (err,value,url) => {
            if(value > 0) {
              dhis2.saveImmunizationData(dhisData.dataelement,dhisData.catoptcomb,LAST_MONTH,'lu8jx9fCLp8',value,(err,res,body,catOptComb,dataElement) => {
                winston.error("Total===>"+value+" CatOptComb===>"+ catOptComb+" "+ "Data Element===>"+dataElement+ " "+JSON.stringify(body))
              })
            }
            winston.error("CatOptComb " + (index+1) + "/" + dhisDataMapping.length + " Processed With " + value + " Records")
            if(index == dhisDataMapping.length-1)
            winston.error('DONE')
          })
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
          const server = app.listen(8544, () => {
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
    const server = app.listen(8544, () => callback(server))
  }
}
exports.start = start

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => winston.info('Listening on 8544...'))
}
