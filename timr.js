'use strict'
const winston = require('winston')
const request = require('request')
const _ = require('underscore')
const URI = require('urijs')
const moment = require("moment")
const catOptOpers = require('./config/categoryOptionsOperations.json')
const timrDhisImm = require('./terminologies/timr-immunization-to-DHIS2-immunization-conceptmap.json')

module.exports = function (timrcnf,oauthcnf) {
  const timrconfig = timrcnf
  const timroauthconfig = oauthcnf
  return {
    getAccessToken: function (callback) {
      let url = URI(timroauthconfig.url)
      let before = new Date()
      var options = {
        url: url.toString(),
        headers: {
          Authorization: `BASIC ${timroauthconfig.token}`
        },
        body: `grant_type=password&username=${timroauthconfig.username}&password=${timroauthconfig.password}&scope=${timroauthconfig.scope}`
      }
      request.post(options, (err, res, body) => {
        if (err) {
          return callback(err)
        }
        callback(err, res, body)
      })
    },
    hasAge: function (dhisData,callback) {
      dhisData.catopts.forEach((catOpt,dhisdataindex) => {
        catOptOpers.forEach((catOptOper) => {
          if(catOptOper.code == catOpt.id) {
            catOptOper.operations.forEach((oper,catoptoperindex) => {
              if(_.contains(["years","months","weeks"],catOptOper.dimension[catoptoperindex]))
                callback(true)
              if(dhisdataindex === dhisData.catopts.length-1 && catOptOper.operations.length-1 === catoptoperindex)
                callback(false)
            })
          }
        })
      })
    },

    getQueryParameters: function (dhisData,callback) {
      var age = ["years","months","weeks"]
      var query = ""
      var queries = []
      var ages = []
      dhisData.catopts.forEach((catOpt,dhisdataindex) => {
        catOptOpers.forEach((catOptOper) => {
          if(catOptOper.code == catOpt.id) {
            catOptOper.operations.forEach((oper,catoptoperindex) => {
              var birthDate = ""
              if(_.contains(age,catOptOper.dimension[catoptoperindex])) {
                ages.push({"value":oper.value,"dimension":catOptOper.dimension[catoptoperindex],'operation':oper.operation})
              }
              else {
                var dimension = catOptOper.dimension[catoptoperindex]
                var value = oper.value
              }
              if(query && value)
              query = query +"&" + dimension + oper.operation + value
              else if(value)
              query = dimension + oper.operation + value
              if(dhisdataindex === dhisData.catopts.length-1 && catOptOper.operations.length-1 === catoptoperindex) {
                //make sure patient.gender is the first parameter
                if(query.includes('&patient.gender')) {
                  var genderPar = ""
                  var operArr = query.split('&')
                  operArr.forEach((par) => {
                    if(par.includes('patient.gender'))
                    genderPar = par
                  })
                  query = query.replace('&'+genderPar,'')
                  query = genderPar+'&'+query
                }
                //if categoryOptionCombo has Age,then we need to calculate Age for every vaccine date
                if(ages.length>0) {
                  this.addAgeOnQueryParameter(ages,query,(queries) => {
                    callback(queries)
                  })
                }
                else {
                  var vaccineStartDate = moment().subtract(1,'month').startOf('month').format('YYYY-MM-DD')
                  var vaccineEndDate = moment().subtract(1,'month').endOf('month').format('YYYY-MM-DD')
                  query = query + '&date=ge' + vaccineStartDate + '&date=le' + vaccineEndDate
                  queries.push({'query':query})
                  callback(queries)
                }
              }
            })
          }
        })
      })
    },

    addAgeOnQueryParameter: function (ages,query,callback) {
      var endDay = moment().subtract(1,'month').endOf('month').format('D') //getting the last day of last month
      var startDay = 1;
      var queries = []
      for(var day=startDay;day<=endDay;day++) {
        var birthDatePar = ''
        ages.forEach((age,index) => {
          if(day<10)
          var dateDay = '0' + day
          else
          var dateDay = day
          var vaccineDate = moment().subtract(1,'month').format('YYYY-MM') + '-' + dateDay
          var birthDate = moment(vaccineDate).subtract(age.value,age.dimension).format('YYYY-MM-DDTHH:mm:ss')
          birthDatePar = birthDatePar + '&patient.birthDate' + age.operation + birthDate

          if(ages.length-1 == index) {
            if(query)
            var newQuery = query + '&date=ge' + vaccineDate + 'T00:00'+ '&date=le' + vaccineDate + 'T23:59' + birthDatePar
            else
            var newQuery = '&date=ge' + vaccineDate + 'T00:00'+ '&date=le' + vaccineDate + 'T23:59' + birthDatePar
            queries.push({'query':newQuery})
          }
          if(day == endDay && ages.length-1 == index) {
            callback (queries)
          }
        })
      }
    },

    getVaccineCode: function (dataelement,callback) {
      timrDhisImm.group.forEach((groups) => {
        groups.element.forEach((element)=>{
          if(element.code == dataelement) {
            element.target.forEach((target) => {
              callback(target.code)
            })
          }
        })
      })
    },

    getImmunizationData: function (access_token,dhisData,facilityid,callback) {
      var dataelement = dhisData.dataelement
      var catOptComb = dhisData.catoptcomb
      this.getVaccineCode(dataelement,(vaccinecode)=> {
        if(vaccinecode == "") {
          return
        }

        this.getQueryParameters(dhisData,(queries) => {
          var totalValues = 0
          queries.forEach((qry,index)=> {
            let url = URI(timrconfig.url)
            .segment('fhir')
            .segment('Immunization')
            +'?'+qry.query+'&vaccine-code='+vaccinecode+'&location.identifier=HIE_FRID|'+facilityid+'&_format=json&_count=0'
            .toString()
            var options = {
              url: url.toString(),
              headers: {
                Authorization: `BEARER ${access_token}`
              }
            }
            request.get(options, (err, res, body) => {
              if (err) {
                return callback(err)
              }
              totalValues = totalValues + JSON.parse(body).total
              if(queries.length-1 == index) {
                callback(err,totalValues,url)
              }
            })
          })
        })
      })
    }

  }
}
