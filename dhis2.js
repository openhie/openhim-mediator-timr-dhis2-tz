'use strict'
const winston = require('winston')
const request = require('request')
const URI = require('urijs')
const imm_dataelements = require('./terminologies/dhis-immunization-valuesets.json')

module.exports = function (cnf) {
  const config = cnf
  return {
    getDhisDataMapping: function (callback) {
      var total = imm_dataelements.compose.include[0].concept.length
      var concept = imm_dataelements.compose.include[0].concept
      var url = config.url
      var username = config.username
      var password = config.password
      var dhisDataMapping = []
      concept.forEach ((dataelement,dataelementindex) => {
        this.getCategoryCombo (dataelement.code,(err,catComb,dataelement) => {
          this.getCategoryOptionCombo(catComb,(err,catOptCombs) => {
            catOptCombs.forEach ((catOptComb,catoptcombindex) => {
              var catOptCombCode = catOptComb.id
              this.getCategoryOptions(catOptCombCode,(err,catOpt) => {
                dhisDataMapping.push({"dataelement":dataelement,"catoptcomb":catOptCombCode,"catopts":catOpt})
                if(dataelementindex===concept.length-1 && catoptcombindex===catOptCombs.length-1) {
                  callback("",dhisDataMapping)
                }
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
        var catComb = JSON.parse(body).categoryCombo.id
        callback(err,catComb,dataelement)
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
        callback(null,res,body,catOptCombo,dataElement)
      })
    }
  }
}
