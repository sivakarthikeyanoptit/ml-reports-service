var config = require('../../config/config');
var rp = require('request-promise');
var request = require('request');
var cassandra = require('cassandra-driver');
var client = new cassandra.Client({
  contactPoints: [config.cassandra.host],
  keyspace: config.cassandra.keyspace,
  localDataCenter: 'datacenter1'
});
var model = require('../../db');
var helperFunc = require('../../helper/chartData');
var commonCassandraFunc = require('../../common/cassandraFunc');
var pdfHandler = require('../../helper/commonHandler');
var ejs = require('ejs');
var fs = require('fs');
var uuidv4 = require('uuid/v4');
var rimraf = require("rimraf");
const AWS = require('aws-sdk');
const util = require('util');
const readFile = util.promisify(fs.readFile);
var async = require('async');
var omit = require('object.omit');


// Controller for instance observation report
exports.instanceReport = async function (req, res) {
  if (!req.body.submissionId) {
    res.status(400);
    var response = {
      result: false,
      message: 'submissionId is a required field'
    };
    res.send(response);
  } else {
    bodyData = req.body;
    var dataReportIndexes = await commonCassandraFunc.checkReqInCassandra(bodyData);

    if (dataReportIndexes == undefined) {
      model.MyModel.findOneAsync({ qid: "instance_observation_query" }, { allow_filtering: true })
        .then(async function (result) {
          var bodyParam = JSON.parse(result.query);
          if (config.druid.observation_datasource_name) {
            bodyParam.dataSource = config.druid.observation_datasource_name;
          }
          bodyParam.filter.value = req.body.submissionId;
          //pass the query as body param and get the resul from druid
          var options = config.druid.options;
          options.method = "POST";
          options.body = bodyParam;
          var data = await rp(options);
          if (!data.length) {
            res.send({
              "data": "Not observerd"
            });
          } else {
            var responseObj = await helperFunc.instanceReportChart(data);
            if (req.body.download) {
              console.log("download");
              responseObj.pdfUrl = "http://www.africau.edu/images/default/sample.pdf";
            }
            res.send(responseObj);
            commonCassandraFunc.insertReqAndResInCassandra(bodyData, responseObj);
          }
        })
        .catch(function (err) {
          res.status(400);
          var response = {
            result: false,
            message: 'Data not found'
          };
          res.send(response);
        });
    } else {
      res.send(JSON.parse(dataReportIndexes['apiresponse']));
    }
  }
};

async function instancePdfFunc(req) {
  return new Promise(function (resolve, reject) {
    model.MyModel.findOneAsync({
      qid: "instance_observation_query"
    }, {
      allow_filtering: true
    })
      .then(async function (result) {

        console.log("result", result);

        var bodyParam = JSON.parse(result.query);
        //bodyParam.dataSource = "sl_observation_dev";
        if (config.druid.observation_datasource_name) {
          bodyParam.dataSource = config.druid.observation_datasource_name;
        }
        bodyParam.filter.value = req.submissionId;
        var query = {
          submissionId: req.submissionId
        }

        //pass the query as body param and get the resul from druid
        var options = config.druid.options;
        options.method = "POST";
        options.body = bodyParam;
        var data = await rp(options);

        if (!data.length) {
          resolve({
            "status": "failed",
            "error": "Not observerd"
          });
        } else {

          // console.log("data======",data);
          var responseObj = await helperFunc.instanceReportChart(data)
          resolve(responseObj);
        }
      })
      .catch(function (err) {
        reject(err);
      });
  });
}

exports.instancePdfReport = async function (req, res) {
  if (!req.query.submissionId) {
    res.status(400);
    var response = {
      result: false,
      message: 'submissionId is a required field'
    };
    res.send(response);
  } else {
    reqData = req.query;
    console.log("reqData",reqData)
    var dataReportIndexes = await commonCassandraFunc.checkReqInCassandra(reqData);
    // if(dataReportIndexes){

    // }
    // dataReportIndexes.downloadpdfpath = "instanceLevelPdfReports/instanceLevelReport.pdf";

    // console.log("dataReportIndexes", dataReportIndexes);
    // dataReportIndexes.downloadpdfpath = "";
    if (dataReportIndexes && dataReportIndexes.downloadpdfpath) {
      // var instaRes = await instancePdfFunc(reqData);

      console.log(dataReportIndexes.downloadpdfpath,"dataReportIndexes", dataReportIndexes.id);
      dataReportIndexes.downloadpdfpath = dataReportIndexes.downloadpdfpath.replace(/^"(.*)"$/, '$1');
      let signedUlr = await pdfHandler.getSignedUrl(dataReportIndexes.downloadpdfpath);

      // call to get SignedUrl 
      console.log("instaRes=======", signedUlr);

      var response = {
        status: "success",
        message: 'Observation Pdf Generated successfully',
        pdfUrl: signedUlr
      };
      res.send(response);

    } else {
      var instaRes = await instancePdfFunc(reqData);

      if(("observationName" in instaRes) == true) {      
      let resData = await pdfHandler.pdfGeneration(instaRes);

      if (dataReportIndexes) {
        var reqOptions = {
          query: dataReportIndexes.id,
          downloadPath:resData.downloadPath
        }
        commonCassandraFunc.updateInstanceDownloadPath(reqOptions);
      } else {
        let dataInsert = commonCassandraFunc.insertReqAndResInCassandra(reqData, instaRes, resData.downloadPath);
      }

      // res.send(resData);
         res.send(omit(resData,'downloadPath'));
      }

      else {
          res.send(instaRes);
      }
    }
  }
};








