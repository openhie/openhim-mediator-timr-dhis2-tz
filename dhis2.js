'use strict'
const winston = require('winston')
const request = require('request')
const URI = require('urijs')
const utils = require('./utils')
const async = require('async')
const isJSON = require('is-json')

module.exports = function (cnf) {
  const config = cnf
  return {
    pushToArray: function(dhisDataMapping,dataelement,catOptCombCode,catOpt,callback) {
      dhisDataMapping.push({"dataelement":dataelement,"catoptcomb":catOptCombCode,"catopts":catOpt})
      callback(dhisDataMapping)
    },

    getDhisDataMapping: function (valuesets,callback) {
      var total = valuesets.compose.include[0].concept.length
      var concept = valuesets.compose.include[0].concept
      var url = config.url
      var username = config.username
      var password = config.password
      var dhisDataMapping = []
      var catOptCombsLen = []
      var testLen = []
      async.eachSeries(concept,(dataelement,nextConcept)=>{
        this.getCategoryCombo (dataelement.code,(err,catComb) => {
          if(err){
            return nextConcept()
          }
          this.getCategoryOptionCombo(catComb,(err,catOptCombs) => {
            if(err) {
              return nextConcept()
            }
            async.eachSeries(catOptCombs,(catOptComb,nextCatComb)=>{
              var catOptCombCode = catOptComb.id
              this.getCategoryOptions(catOptCombCode,(err,catOpt) => {
                if(err){
                  return nextCatComb()
                }
                dhisDataMapping.push({"dataelement":dataelement.code,"catoptcomb":catOptCombCode,"catopts":catOpt})
                return nextCatComb()
              })
            },function(){
              return nextConcept()
            })
          })
        })
      },function(){
        return callback("",dhisDataMapping)
      })
    },
    getCategoryCombo: function (dataelement,callback) {
      var url = URI(config.url).segment('api/dataElements/'+dataelement)
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
        if(!isJSON(body)) {
          winston.error("DHIS2 has retrned non json data")
          err = true
          return callback(err)
        }
        callback(err,JSON.parse(body).categoryCombo.id)
      })
    },

    getCategoryOptionCombo: function (categoryCombo,callback) {
      var url = URI(config.url).segment('api/categoryCombos/'+categoryCombo)
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
        if(!isJSON(body)) {
          winston.error("DHIS2 has retrned non json data")
          err = true
          return callback(err)
        }
        callback(err,JSON.parse(body).categoryOptionCombos)
      })
    },

    getCategoryOptions: function (categoryOptionCombo,callback) {
      var url = URI(config.url).segment('api/categoryOptionCombos/'+categoryOptionCombo)
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
        if(!isJSON(body)) {
          winston.error("DHIS2 has retrned non json data")
          err = true
          return callback(err)
        }
        callback(err,JSON.parse(body).categoryOptions)
      })
    },

    saveDHISData: function (dataElement,catOptCombo,period,orgCode,value,orchestrations,callback) {
      var url = URI(config.url).segment('api/dataValueSets')
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
      var reqBody = {
        "dataValues": [
          {'dataElement':dataElement,'categoryOptionCombo':catOptCombo,'period':period,'orgUnit':orgCode,'value':value}
        ]
      }
      var options = {
        url: url.toString(),
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth
        },
        json:{
          "dataValues": [
            {'dataElement':dataElement,'categoryOptionCombo':catOptCombo,'period':period,'orgUnit':orgCode,'value':value}
          ]
        }
      }
      let before = new Date()
      request.post(options, function (err, res, body) {
        orchestrations.push(utils.buildOrchestration('Saving Immunization Data To DHIS2', before, 'POST', url.toString(), JSON.stringify(reqBody), res, JSON.stringify(body)))
        if (err) {
          return callback(err)
        }
        callback(null,res,body)
      })
    }
  }
}
