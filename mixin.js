module.exports = {
  extractFacilityData: (facilityId, data, callback) => {
    let facData = data.filter((dt) => {
      return dt.facility_id === facilityId
    })
    return callback(facData)
  },
  translateAgeGroup: (ageGroup, callback) => {
    var ageGroups = []
    var ageOper = []

    if (ageGroup.includes("||")) {
      ageGroups = ageGroup.split("||")
    } else if (ageGroup.includes("&&")) {
      ageGroups = ageGroup.split("&&")
    } else {
      ageGroups = [ageGroup]
    }

    for (var index in ageGroups) {
      var age = ''
      var ageGroup = ageGroups[index]
      if (ageGroup == '') {
        return callback('', 'Empty Age Group')
      }
      //convert to lower case
      ageGroup = ageGroup.toLowerCase()
      //replace all empty strings
      ageGroup = ageGroup.replace(/\s/g, '')
      var dimension = null
      var operator = ageGroup.charAt(0)
      if (operator == '<' || operator == '>') {
        // if the operator was >= or <= then get the = sign
        if (ageGroup.charAt(1) === '=') {
          operator += '='
        }
        for (let char of ageGroup) {
          if (!isNaN(char)) {
            age += char
          }
        }
        if (age == '') {
          return callback('', 'No age found on the age group ')
        }

        var dim = ageGroup.replace(age, '')
        dim = dim.replace(/<|>/g, '')
        if (dim.includes('week'))
          dimension = 'DAY'
        else if (dim.includes('month'))
          dimension = 'MONTH'
        else if (dim.includes('year'))
          dimension = 'YEAR'
        else
          return callback('', 'Age group must contain either of the string Years or Months or Weeks')

        // convert weeks to days
        if (dim.includes('week')) {
          age = age * 7
        }
        ageOper.push({
          operator: operator,
          age: age + ' ' + dimension
        })
        // for month, catch +30 days i.e if 3 months then get 3 and 1 day, 3 and 2 days etc
        // if (dimension == 'MONTH') {
        //   ageOper.push({
        //     operator: '>=',
        //     age: age + ' ' + dimension
        //   })
        //   if(!ageGroup.includes('&&') && !ageGroup.includes('||')) {
        //     ageOper.push({
        //       operator: '<=',
        //       age: age + '.9 ' + dimension
        //     })
        //   }
        // } else {
        //   ageOper.push({
        //     operator: operator,
        //     age: age + ' ' + dimension
        //   })
        // }
      } else if (operator === '=') {
        // remove = sign
        ageGroup = ageGroup.replace('=', '')
        for (let char of ageGroup) {
          if (!isNaN(char)) {
            age += char
          }
        }
        if (age == '') {
          return callback('', 'No age found on the age group ')
        }
        var dim = ageGroup.replace(age, '')
        dim = dim.trim()
        dim = dim.toLowerCase()

        if (dim.includes('week')) {
          dimension = 'DAY'
          var position = dim.indexOf("week")
        } else if (dim.includes('month')) {
          dimension = 'MONTH'
          var position = dim.indexOf("month")
        } else if (dim.includes('year')) {
          dimension = 'YEAR'
          var position = dim.indexOf("year")
        } else {
          return callback('', 'Age group must contain either of the string Years or Months or Weeks ')
        }

        // convert weeks to days
        if (dim.includes('week')) {
          age = age * 7
        }
        //make sure the position of dimension is at 0
        if (position != 0) {
          return callback('', 'Invalid Age Group Definition ')
        }

        // for month, catch +30 days i.e if 3 months then get 3 and 1 day, 3 and 2 days etc
        if (dimension == 'MONTH') {
          ageOper.push({
            operator: '>=',
            age: age + ' ' + dimension
          })
          if(!ageGroup.includes('&&') && !ageGroup.includes('||')) {
            ageOper.push({
              operator: '<=',
              age: age + '.9 ' + dimension
            })
          }
        } else {
          ageOper.push({
            operator: '=',
            age: age + ' ' + dimension
          })
        }
      } else {
        return callback('', 'Unknown operation,expected age range e.g 10-12Years or operators < or > ')
      }
    }
    callback(ageOper, false)
  }
}
