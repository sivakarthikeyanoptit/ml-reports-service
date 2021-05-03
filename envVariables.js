/**
 * name : envVariables.js.
 * author : Deepa.
 * created-date : 19-June-2020.
 * Description : Required Environment variables .
 */

let table = require("cli-table");

let tableData = new table();

let enviromentVariables = {
  "APPLICATION_PORT" : {
    "message" : "Please specify the value for e.g. 4700",
    "optional" : false
  },
  "APPLICATION_ENV" : {
    "message" : "Please specify the value for e.g. local/development/qa/production",
    "optional" : false
  },
  "DRUID_URL" : {
    "message" : "Required",
    "optional" : false
  },
   "OBSERVATION_DATASOURCE_NAME" : {
    "message" : "Required",
    "optional" : false
  },
  "OBSERVATION_EVIDENCE_DATASOURCE_NAME" : {
    "message" : "Required",
    "optional" : false
  },
  "SURVEY_DATASOURCE_NAME" : {
    "message" : "Required",
    "optional" : false
  },
  "SURVEY_EVIDENCE_DATASOURCE_NAME" : {
    "message" : "Required",
    "optional" : false
  },
  "ENTITY_SCORE_REPORT_THRESHOLD" : {
    "message" : "Required",
    "optional" : false
  },
  "EVIDENCE_THRESHOLD" : {
    "message" : "Required",
    "optional" : false
  },
  "GOTENBERG_URL" : {
    "message" : "Required",
    "optional" : false
  },
  "ML_SURVEY_SERVICE_URL" : {
    "message" : "Required",
    "optional" : false
  },
  "ML_CORE_SERVICE_URL" : {
    "message" : "Required",
    "optional" : false
  }
}

let success = true;

module.exports = function() {
  Object.keys(enviromentVariables).forEach(eachEnvironmentVariable=>{
  
    let tableObj = {
      [eachEnvironmentVariable] : ""
    };

    if( 
      enviromentVariables[eachEnvironmentVariable].requiredIf
      && process.env[enviromentVariables[eachEnvironmentVariable].requiredIf.key] 
      && process.env[enviromentVariables[eachEnvironmentVariable].requiredIf.key] === enviromentVariables[eachEnvironmentVariable].requiredIf.value
    ) {
      tableObj[eachEnvironmentVariable].optional = false;
    }
  
    if( 
      !(process.env[eachEnvironmentVariable]) && 
      !(enviromentVariables[eachEnvironmentVariable].optional)
    ) {
      
      success = false;

      if( 
        enviromentVariables[eachEnvironmentVariable].default &&
        enviromentVariables[eachEnvironmentVariable].default != "" 
      ) {
        process.env[eachEnvironmentVariable] = 
        enviromentVariables[eachEnvironmentVariable].default;
      }

      if(
        enviromentVariables[eachEnvironmentVariable] && 
        enviromentVariables[eachEnvironmentVariable].message !== ""
      ) {
        tableObj[eachEnvironmentVariable] = 
        enviromentVariables[eachEnvironmentVariable].message;
      } else {
        tableObj[eachEnvironmentVariable] = "required";
      }

    } else {

      tableObj[eachEnvironmentVariable] = "Passed";
      
      if( 
        enviromentVariables[eachEnvironmentVariable].possibleValues &&
        !enviromentVariables[eachEnvironmentVariable].possibleValues.includes(process.env[eachEnvironmentVariable])
      ) {
        tableObj[eachEnvironmentVariable] = ` Valid values - ${enviromentVariables[eachEnvironmentVariable].possibleValues.join(", ")}`;
      }
      
    }

    tableData.push(tableObj);
  })

  console.log(tableData.toString());

  return {
    success : success
  }
}


