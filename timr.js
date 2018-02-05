'use strict'
const winston = require('winston')
const request = require('request')
const _ = require('underscore')
const URI = require('urijs')
const moment = require("moment")
const utils = require('./utils')
const isJSON = require('is-json')
const async = require('async')
const catOptOpers = require('./config/categoryOptionsOperations.json')
const dataElementsOpers = require('./config/dataElementsOperations.json')
const immunizationConcMap = require('./terminologies/timr-DHIS2-immunization-conceptmap.json')
const supplementsConcMap = require('./terminologies/timr-DHIS2-supplements-conceptmap.json')
const breastFeedConcMap = require('./terminologies/timr-DHIS2-breastfeeding-conceptmap.json')
const PMTCTConcMap = require('./terminologies/timr-DHIS2-pmtct-conceptmap.json')
const TTConcMap = require('./terminologies/timr-DHIS2-TT-conceptmap.json')
const WeightAgeRatioConcMap = require('./terminologies/timr-DHIS2-weight_age_ratio-conceptmap.json')

module.exports = function (timrcnf,oauthcnf) {
  const timrconfig = timrcnf
  const timroauthconfig = oauthcnf
  return {
    getAccessToken: function (orchestrations,callback) {
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
        orchestrations.push(utils.buildOrchestration('Getting Access Token From TImR', before, 'POST', url.toString(), options.body, res, body))
        if (err) {
          return callback(err)
        }
        if(!isJSON(body)) {
          winston.error("TImR has returned non JSON results while getting Access Token For " + timroauthconfig.scope)
          err = true
          return callback(err)
        }
        return callback(err, res, body)
      })
    },

    /**
    Category options defines filters for a dataelement
    The file catOptOpers.json translates these filters on the way FHIR can understand
    This function fetches every filter in catOptOpers.json and create a FHIR query
    **/
    createQueryOnCatOpts: function (dhisData,callback) {
      var age = ["years","months","weeks"]
      var query = null
      var queries = []
      var ages = []
      var catOptOperLen = []
      var counter1 = dhisData.catopts.length
      var me = this
      async.eachSeries(dhisData.catopts,(catOpt,nextdhisData)=>{
        async.eachSeries(catOptOpers,(catOptOper,nextcatOptOper)=>{
          if(catOptOper.code == catOpt.id) {
            var counter = 0
            async.eachOfSeries(catOptOper.operations,(oper,catoptoperindex,nextOper)=>{
              var birthDate = ""
              value = null
              if(_.contains(age,catOptOper.dimension[catoptoperindex])) {
                ages.push({"value":oper.value,"dimension":catOptOper.dimension[catoptoperindex],'operation':oper.operation})
              }
              else {
                var dimension = catOptOper.dimension[catoptoperindex]
                var value = oper.value
              }
              if(query != null && value != null) {
                query = query +"&" + dimension + oper.operation + value
              }
              else if(value != null) {
                query = dimension + oper.operation + value
              }
              return nextOper()
            },function(){
              return nextcatOptOper()
            })
          }
          else
            return nextcatOptOper()
        },function(){
          return nextdhisData()
        })
      },function(){
        //make sure patient.gender is the first parameter
        me.createQueryOnDataElmnts(dhisData,ages,query,(ages,query)=>{
          if(query !=null && query != undefined && query != "" && query.includes('&patient.gender')) {
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
            me.addAgeOnQueryParameter(ages,query,(queries) => {
              return callback(queries)
            })
          }
          else {
            var vaccineStartDate = moment().subtract(1,'month').startOf('month').format('YYYY-MM-DD')
            var vaccineEndDate = moment().subtract(1,'month').endOf('month').format('YYYY-MM-DD')
            query = query + '&date=ge' + vaccineStartDate + '&date=le' + vaccineEndDate
            queries.push({'query':query})
            return callback(queries)
          }
        })
      })
    },

    /**
    Some dataelements has no all operations defined using categoryOptions,
    The file dataElementsOperations.json defines some extra operations of such dataelements
    This function checks if a dataelement has some extra operations that are not defined in categoryOptions and add them as query par
    **/
    createQueryOnDataElmnts: function (dhisData,ages,query,callback) {
      var age = ["years","months","weeks"]
      var queries = []
      var catOptOperLen = []
      var counter1 = dhisData.catopts.length
      var dataelement = dhisData.dataelement
      async.eachSeries(dhisData.catopts,(catOpt,nextcatOpts)=>{
        async.eachSeries(dataElementsOpers,(dataElOper,nextDataOper)=>{
          if(dataElOper.code == dataelement) {
            var counter = 0
            async.eachOfSeries(dataElOper.operations,(oper,dataelemntoperindex,nextOper)=>{
              var birthDate = ""
              value = null
              if(_.contains(age,dataElOper.dimension[dataelemntoperindex])) {
                ages.push({"value":oper.value,"dimension":dataElOper.dimension[dataelemntoperindex],'operation':oper.operation})
              }
              else {
                var dimension = dataElOper.dimension[dataelemntoperindex]
                var value = oper.value
              }
              if(query != null && value != null) {
                query = query +"&" + dimension + oper.operation + value
              }
              else if(value != null) {
                query = dimension + oper.operation + value
              }
              return nextOper()
            },function(){
              return nextDataOper()
            })
          }
          else 
            return nextDataOper()
        },function(){
          return nextcatOpts()
        })
      },function(){
        return callback(ages,query)
      })
    },

    addAgeOnQueryParameter: function (ages,query,callback) {
      var endDay = moment().subtract(1,'month').endOf('month').format('D') //getting the last day of last month
      var startDay = 1;
      var queries = []
      var countDay = endDay
      var days = Array.from({length: endDay}, (v, k) => k+1)
      async.eachSeries(days,(day,nextDay)=>{
        var birthDatePar = ''
        if(day<10)
        var dateDay = '0' + day
        else
        var dateDay = day
        var vaccineDate = moment().subtract(1,'month').format('YYYY-MM') + '-' + dateDay
        async.eachSeries(ages,(age,nextAge)=>{
          var birthDate = moment(vaccineDate).subtract(age.value,age.dimension).format('YYYY-MM-DDTHH:mm:ss')
          birthDatePar = birthDatePar + '&patient.birthDate' + age.operation + birthDate
          nextAge()
        },function(){
          if(query)
          var newQuery = query + '&date=ge' + vaccineDate + 'T00:00'+ '&date=le' + vaccineDate + 'T23:59' + birthDatePar
          else
          var newQuery = 'date=ge' + vaccineDate + 'T00:00'+ '&date=le' + vaccineDate + 'T23:59' + birthDatePar
          queries.push({'query':newQuery})
          return nextDay()
        })
      },function(){
        return callback (queries)
      })
    },

    getTimrCode: function (dhisCode,conceptMapName,callback) {
      async.eachSeries(conceptMapName.group,(groups,nxtGrp)=>{
        async.eachSeries(groups.element,(element,nxtElmnt)=>{
          if(element.code == dhisCode) {
            element.target.forEach((target) => {
              return callback(target.code)
            })
          }
          else
            nxtElmnt()
        },function(){
            nxtGrp()
        })
      },function(){
        return callback("")
      })
    },

    getImmunizationData: function (access_token,dhisData,facilityid,orchestrations,callback) {
      var dataelement = dhisData.dataelement
      var catOptComb = dhisData.catoptcomb
      this.getTimrCode(dataelement,immunizationConcMap,(vaccinecode)=> {
        if(vaccinecode == "") {
          return callback(true)
        }
        this.createQueryOnCatOpts(dhisData,(queries) => {
          var totalValues = 0
          async.eachSeries(queries,(qry,nextQry)=>{
            let url = URI(timrconfig.url)
            .segment('fhir')
            .segment('Immunization')
            +'?'+qry.query+'&vaccine-code='+vaccinecode+'&location.identifier=HIE_FRID|' + facilityid + '&patient.location.identifier=HIE_FRID|' + facilityid + '&_format=json&_count=0'
            .toString()
            var options = {
              url: url.toString(),
              headers: {
                Authorization: `BEARER ${access_token}`
              }
            }
            let before = new Date()
            request.get(options, (err, res, body) => {
              if (err) {
                return callback(err)
              }
              var total = parseInt(JSON.parse(body).total)
              if(total > 0)
              orchestrations.push(utils.buildOrchestration('Fetching Immunization From TImR', before, 'GET', url.toString(), JSON.stringify(options), res, JSON.stringify(body)))
              totalValues = parseInt(totalValues) + total
              return nextQry()
            })
          },function(){
            var err = false
            return callback(err,totalValues)
          })
        })
      })
    },

    getSupplementsData: function (access_token,dhisData,facilityid,orchestrations,callback) {
      var dataelement = dhisData.dataelement
      var catOptComb = dhisData.catoptcomb
      this.getTimrCode(dataelement,supplementsConcMap,(supplementcode)=> {
        if(supplementcode == "") {
          return callback()
        }

        this.createQueryOnCatOpts(dhisData,(queries) => {
          var totalValues = 0
          var processed = queries.length
          queries.forEach((qry,index)=> {
            let url = URI(timrconfig.url)
            .segment('fhir')
            .segment('MedicationAdministration')
            +'?'+qry.query + '&medication=' + supplementcode + '&location.identifier=HIE_FRID|' + facilityid + '&_format=json&_count=0'
            .toString()
            var options = {
              url: url.toString(),
              headers: {
                Authorization: `BEARER ${access_token}`
              }
            }
            let before = new Date()
            request.get(options, (err, res, body) => {
              if (err) {
                return callback(err)
              }
              processed--
              var total = parseInt(JSON.parse(body).total)
              if(total > 0)
              orchestrations.push(utils.buildOrchestration('Fetching Supplements From TImR', before, 'GET', url.toString(), JSON.stringify(options), res, JSON.stringify(body)))
              totalValues = parseInt(totalValues) + total
              if(processed == 0) {
                callback(err,totalValues,url)
              }
            })
          })
        })
      })
    },

    getBreastFeedData: function (access_token,dhisData,facilityid,orchestrations,callback) {
      var dataelement = dhisData.dataelement
      var catOptComb = dhisData.catoptcomb
      this.getTimrCode(dataelement,breastFeedConcMap,(breastfeedcode)=> {
        if(breastfeedcode == "") {
          return callback()
        }

        this.createQueryOnCatOpts(dhisData,(queries) => {
          var totalValues = 0
          var processed = queries.length
          queries.forEach((qry,index)=> {
            qry.query = qry.query.replace("patient.","")
            //Patient resource uses registration-time for date
            qry.query = qry.query.replace(new RegExp("&date","g"),"&registration-time")
            let url = URI(timrconfig.url)
            .segment('fhir')
            .segment('Patient')
            +'?'+qry.query + '&breastfeeding=' + breastfeedcode + '&location.identifier=HIE_FRID|' + facilityid + '&_format=json&_count=0'
            .toString()
            var options = {
              url: url.toString(),
              headers: {
                Authorization: `BEARER ${access_token}`
              }
            }
            let before = new Date()
            request.get(options, (err, res, body) => {
              if (err) {
                return callback(err)
              }
              processed--
              var total = parseInt(JSON.parse(body).total)
              if(total > 0)
              orchestrations.push(utils.buildOrchestration('Fetching Breast Feeding Data From TImR', before, 'GET', url.toString(), JSON.stringify(options), res, JSON.stringify(body)))
              totalValues = parseInt(totalValues) + total
              if(processed == 0) {
                callback(err,totalValues,url)
              }
            })
          })
        })
      })
    },

    getPMTCTData: function (access_token,dhisData,facilityid,orchestrations,callback) {
      var dataelement = dhisData.dataelement
      var catOptComb = dhisData.catoptcomb
      this.getTimrCode(dataelement,PMTCTConcMap,(pmtctcode)=> {
        if(pmtctcode == "") {
          return callback()
        }
        this.createQueryOnCatOpts(dhisData,(queries) => {
          var totalValues = 0
          var processed = queries.length
          queries.forEach((qry,index)=> {
            qry.query = qry.query.replace("patient.","")
            let url = URI(timrconfig.url)
            .segment('fhir')
            .segment('Patient')
            +'?'+qry.query + '&pmtct=' + pmtctcode + '&location.identifier=HIE_FRID|' + facilityid + '&_format=json&_count=0'
            .toString()
            var options = {
              url: url.toString(),
              headers: {
                Authorization: `BEARER ${access_token}`
              }
            }
            let before = new Date()
            request.get(options, (err, res, body) => {
              if (err) {
                return callback(err)
              }
              processed--
              var total = parseInt(JSON.parse(body).total)
              if(total > 0)
              orchestrations.push(utils.buildOrchestration('Fetching PMTCT Data From TImR', before, 'GET', url.toString(), JSON.stringify(options), res, JSON.stringify(body)))
              totalValues = parseInt(totalValues) + total
              if(processed == 0) {
                callback(err,totalValues,url)
              }
            })
          })
        })
      })
    },

    getTTData: function (access_token,dhisData,facilityid,orchestrations,callback) {
      var dataelement = dhisData.dataelement
      var catOptComb = dhisData.catoptcomb
      this.getTimrCode(dataelement,TTConcMap,(ttcode)=> {
        if(ttcode == "") {
          winston.error("No corresponding TImR Code for " + dataelement)
          return callback(true)
        }
        this.createQueryOnCatOpts(dhisData,(queries) => {
          var totalValues = 0
          var processed = queries.length
          queries.forEach((qry,index)=> {
            qry.query = qry.query.replace("patient.","")
            let url = URI(timrconfig.url)
            .segment('fhir')
            .segment('Patient')
            +'?'+qry.query + '&tt-status=' + ttcode + '&location.identifier=HIE_FRID|' + facilityid + '&_format=json&_count=0'
            .toString()
            var options = {
              url: url.toString(),
              headers: {
                Authorization: `BEARER ${access_token}`
              }
            }
            let before = new Date()
            request.get(options, (err, res, body) => {
              if (err) {
                return callback(err)
              }
              processed--
              var total = parseInt(JSON.parse(body).total)
              if(total > 0)
              orchestrations.push(utils.buildOrchestration('Fetching PMTCT Data From TImR', before, 'GET', url.toString(), JSON.stringify(options), res, JSON.stringify(body)))
              totalValues = parseInt(totalValues) + total
              if(processed == 0) {
                callback(err,totalValues,url)
              }
            })
          })
        })
      })
    },

    getMosquitoNetData: function (access_token,dhisData,facilityid,orchestrations,callback) {
      var dataelement = dhisData.dataelement
      var catOptComb = dhisData.catoptcomb
      this.createQueryOnCatOpts(dhisData,(queries) => {
        var totalValues = 0
        var processed = queries.length
        queries.forEach((qry,index)=> {
          //because this is the patient resource then queries dont need to have patient. eg patient.gender should be gender
          qry.query = qry.query.replace("patient.","")
          let url = URI(timrconfig.url)
          .segment('fhir')
          .segment('Patient')
          +'?'+qry.query + '&mosquito-net=True&location.identifier=HIE_FRID|' + facilityid + '&_format=json&_count=0'
          .toString()
          var options = {
            url: url.toString(),
            headers: {
              Authorization: `BEARER ${access_token}`
            }
          }
          let before = new Date()
          request.get(options, (err, res, body) => {
            if (err) {
              return callback(err)
            }
            processed--
            var total = parseInt(JSON.parse(body).total)
            if(total > 0)
            orchestrations.push(utils.buildOrchestration('Fetching Mosquito Net Data From TImR', before, 'GET', url.toString(), JSON.stringify(options), res, JSON.stringify(body)))
            totalValues = parseInt(totalValues) + total
            if(processed == 0) {
              callback(err,totalValues,url)
            }
          })
        })
      })
    },

    getWeightAgeRatioData: function (access_token,dhisData,facilityid,orchestrations,callback) {
      var dataelement = dhisData.dataelement
      var catOptComb = dhisData.catoptcomb
      this.getTimrCode(dataelement,WeightAgeRatioConcMap,(weightageratiocode)=> {
        if(weightageratiocode == "") {
          return callback()
        }
        this.createQueryOnCatOpts(dhisData,(queries) => {
          var totalValues = 0
          var processed = queries.length
          queries.forEach((qry,index)=> {
            let url = URI(timrconfig.url)
            .segment('fhir')
            .segment('Observation')
            +'?'+qry.query + '&code=' + weightageratiocode + '&location.identifier=HIE_FRID|' + facilityid + '&_format=json&_count=0'
            .toString()
            var options = {
              url: url.toString(),
              headers: {
                Authorization: `BEARER ${access_token}`
              }
            }
            let before = new Date()
            request.get(options, (err, res, body) => {
              if (err) {
                return callback(err)
              }
              processed--
              var total = parseInt(JSON.parse(body).total)
              if(total > 0)
              orchestrations.push(utils.buildOrchestration('Fetching Weight-Age Ratio Data From TImR', before, 'GET', url.toString(), JSON.stringify(options), res, JSON.stringify(body)))
              totalValues = parseInt(totalValues) + total
              if(processed == 0) {
                callback(err,totalValues,url)
              }
            })
          })
        })
      })
    },

    getChildVisitData: function (access_token,dhisData,facilityid,orchestrations,callback) {
      var dataelement = dhisData.dataelement
      var catOptComb = dhisData.catoptcomb
      this.createQueryOnCatOpts(dhisData,(queries) => {
        var totalValues = 0
        var processed = queries.length
        queries.forEach((qry,index)=> {
          let url = URI(timrconfig.url)
          .segment('fhir')
          .segment('Encounter')
          +'?'+qry.query + '&location.identifier=HIE_FRID|' + facilityid + '&_format=json&_count=0'
          .toString()
          var options = {
            url: url.toString(),
            headers: {
              Authorization: `BEARER ${access_token}`
            }
          }
          let before = new Date()
          request.get(options, (err, res, body) => {
            if (err) {
              return callback(err)
            }
            processed--
            var total = parseInt(JSON.parse(body).total)
            if(total > 0)
            orchestrations.push(utils.buildOrchestration('Fetching Child Visits Data From TImR', before, 'GET', url.toString(), JSON.stringify(options), res, JSON.stringify(body)))
            totalValues = parseInt(totalValues) + total
            if(processed == 0) {
              callback(err,totalValues,url)
            }
          })
        })
      })
    }

  }
}
