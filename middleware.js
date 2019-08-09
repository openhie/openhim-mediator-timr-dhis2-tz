const {
  Pool
} = require('pg')
const async = require('async')
const winston = require('winston')
const moment = require('moment');

const pool = new Pool({
  user: 'timr_user',
  host: 'localhost',
  database: 'timrdwh_latest',
  password: 'timr_user',
  port: 5432,
})
module.exports = {
  getImmunizationCoverageData: (ages, callback) => {
    let ageQuery = ''
    async.eachSeries(ages, (age, nxtAge) => {
      ageQuery += ` and sbadm_tbl.act_utc - pat_vw.dob ${age.operator} '${age.age}'::INTERVAL`
      return nxtAge()
    })
    let startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
    let endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
    let query = `select
        ext_id as facility_id,
        mat_tbl.type_mnemonic,
        sbadm_tbl.seq_id,
        pat_vw.gender_mnemonic,
        count(case when lower(catchment.tag_value) = 'true' then 1 else null end) as in_service_area,
        count(case when lower(catchment.tag_value) <> 'true' then 1 else null end) as in_catchment
      from
        sbadm_tbl
            -- Join material
        inner join mat_tbl on (mat_tbl.mat_id = sbadm_tbl.mat_id)
            -- join facility information
        inner join fac_vw on (sbadm_tbl.fac_id = fac_vw.fac_id)
            -- fetch HIE FRID for the facility
        inner join fac_id_tbl on (fac_vw.fac_id = fac_id_tbl.fac_id and nsid = 'TZ_HFR_ID')
            -- Fetch patient information for gender
        inner join pat_vw on (pat_vw.pat_id = sbadm_tbl.pat_id)
            -- fetch catchment indicator extension
        left join act_tag_tbl catchment on (catchment.act_id = sbadm_tbl.act_id and catchment.tag_name = 'catchmentIndicator')
      where
        -- we don't want back-entered data
        sbadm_tbl.act_id not in (select act_id from act_tag_tbl where tag_name = 'backEntry' and lower(tag_value) = 'true')
        -- we dont want supplements
        and sbadm_tbl.type_mnemonic != 'DrugTherapy'
        -- we don't want those vaccinations not done
        and not sbadm_tbl.neg_ind
        -- action occurred during month
        and sbadm_tbl.act_utc::DATE between '${startDate}' and '${endDate}'
        ${ageQuery}
      group by ext_id, mat_tbl.type_mnemonic, pat_vw.gender_mnemonic, sbadm_tbl.seq_id`
    pool.query(query, (err, response) => {
      if (err) {
        winston.error(err)
        return callback([])
      }
      if (response && response.hasOwnProperty('rows')) {
        winston.info("TImR has returned with " + response.rows.length + " rows")
        return callback(response.rows)
      } else {
        winston.warn("Invalid response has been received from TImR for period")
        return callback([])
      }
    })
  },

  getSupplementsData: (ages, callback) => {
    let ageQuery = ''
    if (ages.length == 2) {
      let age1 = ages[0]
      let age2 = ages[1]
      let ageNumber1 = parseFloat(age1.age.split(' ').shift())
      let ageNumber2 = parseFloat(age2.age.split(' ').shift())
      if (ageNumber1 < ageNumber2) {
        ageQuery = ` and act_utc - dob BETWEEN '${age1.age}'::INTERVAL AND '${age2.age}'::INTERVAL`
      } else {
        ageQuery = ` and act_utc - dob BETWEEN '${age2.age}'::INTERVAL AND '${age1.age}'::INTERVAL`
      }
    } else {
      async.eachSeries(ages, (age, nxtAge) => {
        ageQuery += ` and act_utc - dob ${age.operator} '${age.age}'::INTERVAL`
        return nxtAge()
      })
    }

    let startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
    let endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
    let query = `select
          ext_id as facility_id,
          mat_tbl.type_mnemonic as code,
          gender_mnemonic,
          count(*) as total
      from
          sbadm_tbl
          inner join mat_tbl using (mat_id)
          inner join pat_vw using (pat_id)
          inner join fac_vw on (sbadm_tbl.fac_id = fac_vw.fac_id)
          inner join fac_id_tbl on (fac_id_tbl.fac_id = fac_vw.fac_id and nsid = 'TZ_HFR_ID')
      where
          act_utc::DATE between '${startDate}' and '${endDate}'
          ${ageQuery}
          and sbadm_tbl.type_mnemonic = 'DrugTherapy'
      group by ext_id, mat_tbl.type_mnemonic, gender_mnemonic`

    pool.query(query, (err, response) => {
      if (err) {
        winston.error(err)
        return callback([])
      }
      if (response && response.hasOwnProperty('rows')) {
        winston.info("TImR has returned with " + response.rows.length + " rows")
        return callback(response.rows)
      } else {
        winston.warn("Invalid response has been received from TImR")
        return callback([])
      }
    })
  },

  getPMTCTData: (callback) => {
    let startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
    let endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
    let query = `select
        ext_id as facility_id,
        pat_vw.gender_mnemonic,
        ebf.ext_value,
        count(*) as total
      from
        pat_vw
        inner join ent_ext_tbl as ebf on (pat_vw.pat_id = ebf.ent_id and ebf.ext_typ = 'http://openiz.org/extensions/patient/contrib/timr/pctmtStatus')
        inner join fac_id_tbl on (fac_id_tbl.fac_id = pat_vw.fac_id and nsid = 'TZ_HFR_ID')
      where
        crt_utc::DATE between '${startDate}' and '${endDate}' and ext_value='1'
      group by
        ext_id, ebf.ext_value, pat_vw.gender_mnemonic order by ext_id`

    pool.query(query, (err, response) => {
      if (err) {
        winston.error(err)
        return callback([])
      }
      if (response && response.hasOwnProperty('rows')) {
        winston.info("TImR has returned with " + response.rows.length + " rows")
        return callback(response.rows)
      } else {
        winston.warn("Invalid response has been received from TImR")
        return callback([])
      }
    })
  },

  getCTCReferal: (callback) => {
    //add pat_vw.dob - pat_vw.crt_utc < '12 MONTH'::INTERVAL to filter by age
    let startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
    let endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
    let query = `select
        ext_id as facility_id,
        pat_vw.gender_mnemonic,
        ebf.ext_value,
        count(*) as total
      from
        pat_vw
        inner join ent_ext_tbl as ebf on (pat_vw.pat_id = ebf.ent_id and ebf.ext_typ = 'http://openiz.org/extensions/contrib/timr/ctcReferral')
        inner join fac_id_tbl on (fac_id_tbl.fac_id = pat_vw.fac_id and nsid = 'TZ_HFR_ID')
      where
      crt_utc::DATE between '${startDate}' and '${endDate}'
      group by
        ext_id, ebf.ext_value, pat_vw.gender_mnemonic order by ext_id`

    pool.query(query, (err, response) => {
      if (err) {
        winston.error(err)
        return callback([])
      }
      if (response && response.hasOwnProperty('rows')) {
        winston.info("TImR has returned with " + response.rows.length + " rows")
        return callback(response.rows)
      } else {
        winston.warn("Invalid response has been received from TImR")
        return callback([])
      }
    })
  },

  getDispLLINMosqNet: (callback) => {
    let startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
    let endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
    let query = `select
        ext_id as facility_id,
        gender_mnemonic,
        count(*) as total
        from
            sply_tbl
            -- ensure that the material given was a mosquito net
            left join sply_mat_tbl on (sply_tbl.sply_id = sply_mat_tbl.sply_id and sply_mat_tbl.mat_id = '276d2ce0-6504-11e9-a923-1681be663d3e')
            -- in a supply the source entity is the facility
            inner join fac_vw on (src_ent_id = fac_id)
            -- fetch HIE FRID for the facility
            inner join fac_id_tbl on (fac_vw.fac_id = fac_id_tbl.fac_id and nsid = 'TZ_HFR_ID')
            -- in a supply the target entity is the patient (i.e. the facility is supplying to the patient)
            inner join enc_tbl using (enc_id)
            inner join pat_Vw on (enc_tbl.pat_id = pat_vw.pat_id)
        where
            typ_mnemonic = 'ActType-SupplyToPatient'
            and sply_tbl.act_utc::DATE between '${startDate}' and '${endDate}'
        group by ext_id, gender_mnemonic`

    pool.query(query, (err, response) => {
      if (err) {
        winston.error(err)
        return callback([])
      }
      if (response && response.hasOwnProperty('rows')) {
        winston.info("TImR has returned with " + response.rows.length + " rows")
        return callback(response.rows)
      } else {
        winston.warn("Invalid response has been received from TImR")
        return callback([])
      }
    })
  },

  getBreastFeedingData: (ages, code, callback) => {
    let ageQuery = ''
    async.eachSeries(ages, (age, nxtAge) => {
      if (ageQuery) {
        ageQuery += 'and ' + `pat_vw.dob - pat_vw.crt_utc ${age.operator} '${age.age}'::INTERVAL`
      } else {
        ageQuery += `pat_vw.dob - pat_vw.crt_utc ${age.operator} '${age.age}'::INTERVAL`
      }
      return nxtAge()
    }, () => {
      if (ageQuery) {
        ageQuery += ' and'
      }
    })
    let startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
    let endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
    let query = `select
        ext_id as facility_id,
        pat_vw.gender_mnemonic,
        ebf.ext_value,
        count(*) as total
      from
        pat_vw
        inner join ent_ext_tbl as ebf on (pat_vw.pat_id = ebf.ent_id and ebf.ext_typ = 'http://openiz.org/extensions/patient/contrib/timr/breastFeedingStatus')
        inner join fac_id_tbl on (fac_id_tbl.fac_id = pat_vw.fac_id and nsid = 'TZ_HFR_ID')
      where
      ${ageQuery} crt_utc::DATE between '${startDate}' and '${endDate}' and ext_value='${code}'
      group by
        ext_id, ebf.ext_value, pat_vw.gender_mnemonic order by ext_id`

    pool.query(query, (err, response) => {
      if (err) {
        winston.error(err)
        return callback([])
      }
      if (response && response.hasOwnProperty('rows')) {
        winston.info("TImR has returned with " + response.rows.length + " rows")
        return callback(response.rows)
      } else {
        winston.warn("Invalid response has been received from TImR for period " + period.periodName)
        return callback([])
      }
    })
  },

  getWeightAgeRatio: (ages, callback) => {
    let ageQuery = ''
    async.eachSeries(ages, (age, nxtAge) => {
      ageQuery += ' and ' + `act_utc - dob ${age.operator} '${age.age}'::INTERVAL`
      return nxtAge()
    })
    let startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
    let endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
    let query = `select
        ext_id as facility_id,
        gender_mnemonic,
        int_cs as code,
        count(*) as total
      from
        qty_obs_tbl
        inner join pat_vw using (pat_id)
        inner join fac_vw on (qty_obs_tbl.fac_id = fac_vw.fac_id)
        inner join fac_id_tbl on (fac_id_tbl.fac_id = fac_vw.fac_id and nsid = 'TZ_HFR_ID')
      where
        typ_cs = 'VitalSign-Weight'
        and act_utc::DATE between '${startDate}' and '${endDate}'
        ${ageQuery}
      group by ext_id, gender_mnemonic, int_cs`

    pool.query(query, (err, response) => {
      if (err) {
        winston.error(err)
        return callback([])
      }
      if (response && response.hasOwnProperty('rows')) {
        winston.info("TImR has returned with " + response.rows.length + " rows")
        return callback(response.rows)
      } else {
        winston.warn("Invalid response has been received from TImR for period " + period.periodName)
        return callback([])
      }
    })
  },

  getChildVisitData: (ages, callback) => {
    let ageQuery = ''
    async.eachSeries(ages, (age, nxtAge) => {
      ageQuery += ' and ' + `act_utc - dob ${age.operator} '${age.age}'::INTERVAL`
      return nxtAge()
    })
    let startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
    let endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
    let query = `select
          ext_id as facility_id,
          gender_mnemonic,
          count(*) as total
      from
          enc_tbl
          inner join pat_vw using (pat_id)
          inner join fac_vw on (enc_tbl.fac_id = fac_vw.fac_id)
          inner join fac_id_tbl on (fac_id_tbl.fac_id = fac_vw.fac_id and nsid = 'TZ_HFR_ID')
      where
          act_utc::DATE between '${startDate}' and '${endDate}'
          ${ageQuery}
          and pat_vw.sts_cs = 'ACTIVE'
      group by ext_id, gender_mnemonic`

    pool.query(query, (err, response) => {
      if (err) {
        winston.error(err)
        return callback([])
      }
      if (response && response.hasOwnProperty('rows')) {
        winston.info("TImR has returned with " + response.rows.length + " rows")
        return callback(response.rows)
      } else {
        winston.warn("Invalid response has been received from TImR for period " + period.periodName)
        return callback([])
      }
    })
  },

  getTTData: (callback) => {
    let startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
    let endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
    let query = `select
      ext_id as facility_id,
      pat_tbl.gender_mnemonic,
      ebf.ext_value,
      count(*) as total
    from
      pat_tbl
      inner join psn_tbl using (psn_id)
      inner join ent_ext_tbl as ebf on (pat_tbl.pat_id = ebf.ent_id and ebf.ext_typ = 'http://openiz.org/extensions/patient/contrib/timr/tetanusStatus')
      inner join fac_id_tbl on (fac_id_tbl.fac_id = pat_tbl.reg_fac_id and nsid = 'TZ_HFR_ID')
    where
      crt_utc::DATE between '${startDate}' and '${endDate}' and (ext_value='0' or ext_value='1' or ext_value='2')
    group by
      ext_id, ebf.ext_value, pat_tbl.gender_mnemonic order by ext_id`
    pool.query(query, (err, response) => {
      if (err) {
        winston.error(err)
        return callback([])
      }
      if (response && response.hasOwnProperty('rows')) {
        winston.info("TImR has returned with " + response.rows.length + " rows")
        return callback(response.rows)
      } else {
        winston.warn("Invalid response has been received from TImR for period " + period.periodName)
        return callback([])
      }
    })
  }
}