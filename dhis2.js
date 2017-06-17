'use strict'
const winston = require('winston')
const request = require('request')
const URI = require('urijs')
const sleep = require('sleep')
const imm_dataelements = require('./terminologies/dhis-immunization-valuesets.json')

module.exports = function (cnf) {
  const config = cnf
  return {
    pushToArray: function(dhisDataMapping,dataelement,catOptCombCode,catOpt,callback) {
      dhisDataMapping.push({"dataelement":dataelement,"catoptcomb":catOptCombCode,"catopts":catOpt})
      callback(dhisDataMapping)
    },

    getDhisDataMapping: function (callback) {
      var total = imm_dataelements.compose.include[0].concept.length
      var concept = imm_dataelements.compose.include[0].concept
      var url = config.url
      var username = config.username
      var password = config.password
      var dhisDataMapping = []
      var catOptCombsLen = []
      var testLen = []
      concept.forEach ((dataelement,dataelementindex,dataelementArray) => {
        this.getCategoryCombo (dataelement.code,(err,catComb,dataelement) => {
          this.getCategoryOptionCombo(catComb,(err,catOptCombs) => {
            catOptCombsLen[dataelementindex] = dataelementindex + catOptCombs[catOptCombs.length-1].id
            testLen[dataelementindex] = catOptCombs.length
            catOptCombs.forEach ((catOptComb,catoptcombindex,catoptcombArray) => {
              var catOptCombCode = catOptComb.id
              this.getCategoryOptions(catOptCombCode,(err,catOpt) => {
                this.pushToArray(dhisDataMapping,dataelement,catOptCombCode,catOpt,(dhisDataMapping) =>{
                  testLen[dataelementindex]--
                  if(Math.max.apply(null,testLen) === 0) {
                    sleep.sleep(10)
                    callback("",dhisDataMapping)
                  }
                })
              })
            })
          })
        })
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
          return callback(err)
        }
        callback(err,JSON.parse(body).categoryCombo.id,dataelement)
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
        callback(err,JSON.parse(body).categoryOptions)
      })
    },

    saveImmunizationData: function (dataElement,catOptCombo,period,orgCode,value,callback) {
      var url = URI(config.url).segment('api/dataValueSets')
      var username = config.username
      var password = config.password
      var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
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
      request.post(options, function (err, res, body) {
        if (err) {
          return callback(err)
        }
        callback(null,res,body)
      })
    }
  }
}
