const AWS = require('aws-sdk')
const fs = require('fs');
const uuidv4 = require('uuid/v4');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const plugins = require("chartjs-plugin-datalabels");
const width = 800; //px
const height = 450; //px
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });
var rp = require('request-promise');
var ejs = require('ejs');
const path = require('path');
var rimraf = require("rimraf");

const s3 = new AWS.S3(gen.utils.getAWSConnection());
const myBucket = process.env.AWS_BUCKET_NAME;

// const signedUrlExpireSeconds=process.env.AWS_SIGNED_URL_EXPIRE_SECONDS;

exports.getSignedUrl = async function getSignedUrl(filePath) {

    return new Promise(function (resolve, reject) {
        // let myKey = filePath;
        // let url = s3.getSignedUrl('getObject', {
        //     Bucket: myBucket,
        //     Key: myKey,
        //     Expires: process.env.AWS_SIGNED_URL_EXPIRE_SECONDS
        // })

        // return resolve(url);

        let urlInfo = s3SignedUrl(filePath);

        resolve(urlInfo);

    });

}

async function s3SignedUrl(filePath) {
    return new Promise(function (resolve, reject) {
        let myKey = filePath;
        let url = s3.getSignedUrl('getObject', {
            Bucket: myBucket,
            Key: myKey,
            Expires: process.env.AWS_SIGNED_URL_EXPIRE_SECONDS
        })

        return resolve(url);

    });

}


// PDF generation function for entity report
exports.pdfGeneration = async function pdfGeneration(instaRes, storeReportsToS3 = false) {


    return new Promise(async function (resolve, reject) {

        let currentTempFolder = 'tmp/' + uuidv4() + "--" + Math.floor(Math.random() * (10000 - 10 + 1) + 10)

        let imgPath = __dirname + '/../' + currentTempFolder;
        
        try {

            if (!fs.existsSync(imgPath)) {
                fs.mkdirSync(imgPath);
            }

            let bootstrapStream = await copyBootStrapFile(__dirname + '/../public/css/bootstrap.min.css', imgPath + '/style.css');

            // let headerFile = await copyBootStrapFile(__dirname + '/../views/header.html', imgPath + '/header.html');
            let footerFile = await copyBootStrapFile(__dirname + '/../views/footer.html', imgPath + '/footer.html');

            let FormData = [];

            let matrixMultiSelectArray = [];
            let matrixRadioArray = [];
            let multiSelectDataArray = [];
            let radioDataArray = [];

            //loop the response and store multiselect and radio questions of matrix type
            await Promise.all(instaRes.response.map(async ele => {
                if (ele.responseType == "matrix") {
                    await Promise.all(ele.instanceQuestions.map(element => {
                        if (element.responseType == "multiselect") {
                            matrixMultiSelectArray.push(element);
                        }
                        else if (element.responseType == "radio") {
                            matrixRadioArray.push(element);
                        }
                    }))
                } else if (ele.responseType == "multiselect") {
                    multiSelectDataArray.push(ele)
                } else if (ele.responseType == "radio") {
                    radioDataArray.push(ele)
                }
            }))
            
            let multiSelectData = []
            let radioQuestions = [];
            let matrixMultiSelectChartObj = [];
            let matrixRadioChartObj = [];
            let formDataMultiSelect = [];
            let radioFormData = [];
            let formDataMatrixMultiSelect = [];
            let matrixRadioFormData = [];

            //Prepare chart object before sending it to highchart server
            if (multiSelectDataArray.length > 0 ) {
               multiSelectData = await getChartObject(multiSelectDataArray);
               formDataMultiSelect = await createChart(multiSelectData, imgPath);
            }
            if (radioDataArray.length > 0 ) {
                radioQuestions = await getChartObject(radioDataArray);
                radioFormData = await createChart(radioQuestions, imgPath);
            }
            if (matrixMultiSelectArray.length > 0 ) {
                matrixMultiSelectChartObj = await getChartObject(matrixMultiSelectArray);
                formDataMatrixMultiSelect = await createChart(matrixMultiSelectChartObj, imgPath);
            }
            if (matrixRadioArray.length > 0 ) {
                matrixRadioChartObj = await getChartObject(matrixRadioArray);
                matrixRadioFormData = await createChart(matrixRadioChartObj, imgPath);
            }

            FormData.push(...formDataMultiSelect);
            FormData.push(...radioFormData);
            FormData.push(...formDataMatrixMultiSelect);
            FormData.push(...matrixRadioFormData);
           
            let params;

            if (instaRes.solutionName) {
                params = {
                    solutionName: instaRes.solutionName
                }
            }
            else {
                params = {
                    observationName: instaRes.observationName
                }
            }
            ejs.renderFile(__dirname + '/../views/header.ejs', {
                data: params
            })
                .then(function (headerHtml) {

                    let dir = imgPath;
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir);
                    }
                    fs.writeFile(dir + '/header.html', headerHtml, async function (errWr, dataWr) {
                        if (errWr) {
                            throw errWr;
                        } else {
                            
                            let arrOfData = [];
                            let matrixData = [];

                            await Promise.all(instaRes.response.map(async ele => {

                                if (ele.responseType === "text" || ele.responseType === "date" || ele.responseType === "number" || ele.responseType === "slider") {

                                    arrOfData.push(ele);

                                } else if (ele.responseType === "multiselect") {

                                    let dt = formDataMultiSelect.filter(or => {

                                        if (or.order == ele.order) {
                                            return or;
                                        }
                                    })

                                    dt.responseType = "multiselect";
                                    arrOfData.push(dt);

                                } else if (ele.responseType === "radio") {
                                    let dt = radioFormData.filter(or => {

                                        if (or.order == ele.order) {
                                            return or;
                                        }
                                    })

                                    dt.responseType = "radio";
                                    arrOfData.push(dt);

                                } else if (ele.responseType === "matrix") {
                                    //push main matrix question object into array
                                    arrOfData.push(ele);
                                    let obj = {
                                        order: ele.order,
                                        data: []
                                    }

                                    await Promise.all(ele.instanceQuestions.map(element => {
                                        //push the instance questions to the array
                                        if (element.responseType == "text" || element.responseType == "date" || element.responseType == "number" || ele.responseType == "slider") {
                                            obj.data.push(element);
                                        }
                                        else if (element.responseType == "radio") {
                                            let dt = matrixRadioFormData.filter(or => {
                                                if (or.order == element.order) {
                                                    return or;
                                                }
                                            })

                                            dt[0].options.responseType = "radio";
                                            dt[0].options.answers = element.answers;
                                            obj.data.push(dt);

                                        }
                                        else if (element.responseType == "multiselect") {
                                            let dt = formDataMatrixMultiSelect.filter(or => {
                                                if (or.order == element.order) {
                                                    return or;
                                                }
                                            })

                                            dt[0].options.responseType = "multiselect";
                                            dt[0].options.answers = element.answers;

                                            obj.data.push(dt);

                                        }
                                    }))
                                    matrixData.push(obj);
                                }
                            }));

                            let obj = {
                                path: formDataMultiSelect,
                                instaRes: instaRes.response,
                                radioOptionsData: [],
                                orderData: arrOfData,
                                matrixRes: matrixData
                            };

                            ejs.renderFile(__dirname + '/../views/mainTemplate.ejs', {
                                data: obj
                            })
                                .then(function (dataEjsRender) {

                                    var dir = imgPath;
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir);
                                    }
                                    fs.writeFile(dir + '/index.html', dataEjsRender, function (errWriteFile, dataWriteFile) {
                                        if (errWriteFile) {
                                            throw errWriteFile;
                                        } else {

                                            let optionsHtmlToPdf = gen.utils.getGotenbergConnection();
                                            optionsHtmlToPdf.formData = {
                                                files: [
                                                ]
                                            };
                                            FormData.push({
                                                value: fs.createReadStream(dir + '/index.html'),
                                                options: {
                                                    filename: 'index.html'
                                                }
                                            });
                                            FormData.push({
                                                value: fs.createReadStream(dir + '/style.css'),
                                                options: {
                                                    filename: 'style.css'
                                                }
                                            });
                                            FormData.push({
                                                value: fs.createReadStream(dir + '/header.html'),
                                                options: {
                                                    filename: 'header.html'
                                                }
                                            });
                                            FormData.push({
                                                value: fs.createReadStream(dir + '/footer.html'),
                                                options: {
                                                    filename: 'footer.html'
                                                }
                                            });
                                            optionsHtmlToPdf.formData.files = FormData;

                                            rp(optionsHtmlToPdf)
                                                .then(function (responseHtmlToPdf) {

                                                    // console.log("optionsHtmlToPdf", optionsHtmlToPdf.formData.files);
                                                    var pdfBuffer = Buffer.from(responseHtmlToPdf.body);
                                                    if (responseHtmlToPdf.statusCode == 200) {
                                                        fs.writeFile(dir + '/pdfReport.pdf', pdfBuffer, 'binary', function (err) {
                                                            if (err) {
                                                                return console.log(err);
                                                            }
                                                            // console.log("The PDF was saved!");
                                                            const s3 = new AWS.S3(gen.utils.getAWSConnection());
                                                            const uploadFile = () => {
                                                                fs.readFile(dir + '/pdfReport.pdf', (err, data) => {
                                                                    if (err) throw err;
                                                                    const params = {
                                                                        Bucket: process.env.AWS_BUCKET_NAME, // pass your bucket name
                                                                        Key: 'pdfReport/' + uuidv4() + 'pdfReport.pdf', // file will be saved as testBucket/contacts.csv
                                                                        Body: Buffer.from(data, null, 2),
                                                                        Expires: 10
                                                                    };

                                                                    if (storeReportsToS3 == false) {
                                                                        let folderPath = Buffer.from(currentTempFolder).toString('base64')

                                                                        let response = {
                                                                            status: "success",
                                                                            message: 'report generated',
                                                                            pdfUrl: folderPath,

                                                                        };
                                                                        resolve(response);

                                                                    } else {


                                                                        s3.upload(params, function (s3Err, data) {
                                                                            if (s3Err) throw s3Err;


                                                                            console.log(`File uploaded successfully at ${data.Location}`);

                                                                            s3SignedUrl(data.key).then(function (signedRes) {

                                                                                try {



                                                                                    fs.readdir(imgPath, (err, files) => {
                                                                                        if (err) throw err;

                                                                                        // console.log("files",files.length);
                                                                                        var i = 0;
                                                                                        for (const file of files) {

                                                                                            fs.unlink(path.join(imgPath, file), err => {
                                                                                                if (err) throw err;
                                                                                            });

                                                                                            if (i == files.length) {
                                                                                                fs.unlink('../../' + currentTempFolder, err => {
                                                                                                    if (err) throw err;

                                                                                                });
                                                                                                console.log("path.dirname(filename).split(path.sep).pop()", path.dirname(file).split(path.sep).pop());
                                                                                                // fs.unlink(path.join(imgPath, ""), err => {
                                                                                                //     if (err) throw err;
                                                                                                // });
                                                                                            }

                                                                                            i = i + 1;

                                                                                        }
                                                                                    });
                                                                                    rimraf(imgPath, function () { console.log("done"); });

                                                                                } catch (ex) {
                                                                                    console.log("ex ", ex);
                                                                                }

                                                                                var response = {
                                                                                    status: "success",
                                                                                    message: 'report generated',
                                                                                    pdfUrl: signedRes,
                                                                                    downloadPath: data.key
                                                                                };
                                                                                resolve(response);
                                                                            })
                                                                        });

                                                                    }
                                                                });
                                                            };
                                                            uploadFile();
                                                        });
                                                    }
                                                })
                                                .catch(function (err) {
                                                    resolve(err);
                                                    throw err;
                                                });
                                        }
                                    });
                                })
                                .catch(function (errEjsRender) {
                                    console.log("errEjsRender : ", errEjsRender);

                                    reject(errEjsRender);
                                });

                        }

                    });
                });

        } catch (exp) {

        } finally {}
    })

}

// PDF generation function for instance API
exports.instanceObservationPdfGeneration = async function instanceObservationPdfGeneration(instaRes, storeReportsToS3 = false) {


    return new Promise(async function (resolve, reject) {

        var currentTempFolder = 'tmp/' + uuidv4() + "--" + Math.floor(Math.random() * (10000 - 10 + 1) + 10)

        var imgPath = __dirname + '/../' + currentTempFolder;


        try {

            if (!fs.existsSync(imgPath)) {
                fs.mkdirSync(imgPath);
            }

            let bootstrapStream = await copyBootStrapFile(__dirname + '/../public/css/bootstrap.min.css', imgPath + '/style.css');

            // let headerFile = await copyBootStrapFile(__dirname + '/../views/header.html', imgPath + '/header.html');
            let footerFile = await copyBootStrapFile(__dirname + '/../views/footer.html', imgPath + '/footer.html');

            var multiSelectArray = [];
            var radioArray = [];
            let formData = [];

            await Promise.all(instaRes.response.map(async ele => {
                if (ele.responseType == "matrix") {
                    await Promise.all(ele.instanceQuestions.map(element => {
                        if (element.responseType == "multiselect") {
                            multiSelectArray.push(element);
                        }
                        else if (element.responseType == "radio") {
                            radioArray.push(element);
                        }
                    }))
                }

            }))

            //select all the multiselect response objects and create a chart object
            let multiSelectChartObj = await getChartObject(multiSelectArray);
            let radioChartObj = await getChartObject(radioArray);

            let multiselectFormData = await createChart(multiSelectChartObj, imgPath);
            let radioFormData = await createChart(radioChartObj, imgPath);

            formData.push(...multiselectFormData);
            formData.push(...radioFormData);


            var params = {
                observationName: instaRes.observationName
            }
            ejs.renderFile(__dirname + '/../views/header.ejs', {
                data: params
            })
                .then(function (headerHtml) {

                    var dir = imgPath;
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir);
                    }

                    fs.writeFile(dir + '/header.html', headerHtml, async function (errWr, dataWr) {
                        if (errWr) {
                            throw errWr;
                        } else {

                            //Arrange the questions based on the order field
                            var arrOfData = [];
                            var matrixData = [];

                            await Promise.all(instaRes.response.map(async ele => {


                                if (ele.responseType === "text" || ele.responseType === "date" || ele.responseType === "number" || ele.responseType === "slider" || ele.responseType === "multiselect" || ele.responseType === "radio") {

                                    arrOfData.push(ele);

                                } else if (ele.responseType === "matrix") {

                                    //push main matrix question object into array
                                    arrOfData.push(ele);
                                    let obj = {
                                        order: ele.order,
                                        data: []
                                    }
                                    await Promise.all(ele.instanceQuestions.map(element => {
                                        //push the instance questions to the array
                                        if (element.responseType == "text" || element.responseType == "date" || element.responseType == "number" || ele.responseType == "slider") {
                                            obj.data.push(element);
                                        }
                                        else if (element.responseType == "radio") {
                                            let dt = radioFormData.filter(or => {
                                                if (or.order == element.order) {
                                                    return or;
                                                }
                                            })

                                            dt[0].options.responseType = "radio";
                                            dt[0].options.answers = element.answers;
                                            obj.data.push(dt);

                                        }
                                        else if (element.responseType == "multiselect") {
                                            let dt = multiselectFormData.filter(or => {
                                                if (or.order == element.order) {
                                                    return or;
                                                }
                                            })

                                            dt[0].options.responseType = "multiselect";
                                            dt[0].options.answers = element.answers;

                                            obj.data.push(dt);

                                        }
                                    }))

                                    matrixData.push(obj);
                                }
                            }));


                            var obj = {
                                orderData: arrOfData,
                                matrixRes: matrixData
                            };
                            ejs.renderFile(__dirname + '/../views/instanceObservationTemplate.ejs', {
                                data: obj
                            })
                                .then(function (dataEjsRender) {

                                    var dir = imgPath;
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir);
                                    }
                                    fs.writeFile(dir + '/index.html', dataEjsRender, function (errWriteFile, dataWriteFile) {
                                        if (errWriteFile) {
                                            throw errWriteFile;
                                        } else {

                                            let optionsHtmlToPdf = gen.utils.getGotenbergConnection();
                                            optionsHtmlToPdf.formData = {
                                                files: [
                                                ]
                                            };
                                            formData.push({
                                                value: fs.createReadStream(dir + '/index.html'),
                                                options: {
                                                    filename: 'index.html'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/style.css'),
                                                options: {
                                                    filename: 'style.css'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/header.html'),
                                                options: {
                                                    filename: 'header.html'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/footer.html'),
                                                options: {
                                                    filename: 'footer.html'
                                                }
                                            });
                                            optionsHtmlToPdf.formData.files = formData;

                                            rp(optionsHtmlToPdf)
                                                .then(function (responseHtmlToPdf) {

                                                    // console.log("optionsHtmlToPdf", optionsHtmlToPdf.formData.files);
                                                    var pdfBuffer = Buffer.from(responseHtmlToPdf.body);
                                                    if (responseHtmlToPdf.statusCode == 200) {
                                                        fs.writeFile(dir + '/pdfReport.pdf', pdfBuffer, 'binary', function (err) {
                                                            if (err) {
                                                                return console.log(err);
                                                            }
                                                            // console.log("The PDF was saved!");
                                                            const s3 = new AWS.S3(gen.utils.getAWSConnection());
                                                            const uploadFile = () => {
                                                                fs.readFile(dir + '/pdfReport.pdf', (err, data) => {
                                                                    if (err) throw err;
                                                                    const params = {
                                                                        Bucket: process.env.AWS_BUCKET_NAME, // pass your bucket name
                                                                        Key: 'pdfReport/' + uuidv4() + 'pdfReport.pdf', // file will be saved as testBucket/contacts.csv
                                                                        Body: Buffer.from(data, null, 2),
                                                                        Expires: 10
                                                                    };

                                                                    if (storeReportsToS3 == false) {
                                                                        var folderPath = Buffer.from(currentTempFolder).toString('base64')

                                                                        var response = {
                                                                            status: "success",
                                                                            message: 'report generated',
                                                                            pdfUrl: folderPath,

                                                                        };
                                                                        resolve(response);

                                                                    } else {


                                                                        s3.upload(params, function (s3Err, data) {
                                                                            if (s3Err) throw s3Err;

                                                                            // console.log("data", data);
                                                                            console.log(`File uploaded successfully at ${data.Location}`);

                                                                            s3SignedUrl(data.key).then(function (signedRes) {

                                                                                try {



                                                                                    fs.readdir(imgPath, (err, files) => {
                                                                                        if (err) throw err;


                                                                                        var i = 0;
                                                                                        for (const file of files) {

                                                                                            fs.unlink(path.join(imgPath, file), err => {
                                                                                                if (err) throw err;
                                                                                            });

                                                                                            if (i == files.length) {
                                                                                                fs.unlink('../../' + currentTempFolder, err => {
                                                                                                    if (err) throw err;

                                                                                                });
                                                                                                console.log("path.dirname(filename).split(path.sep).pop()", path.dirname(file).split(path.sep).pop());
                                                                                                // fs.unlink(path.join(imgPath, ""), err => {
                                                                                                //     if (err) throw err;
                                                                                                // });
                                                                                            }

                                                                                            i = i + 1;

                                                                                        }
                                                                                    });
                                                                                    rimraf(imgPath, function () { console.log("done"); });

                                                                                } catch (ex) {
                                                                                    console.log("ex ", ex);
                                                                                }

                                                                                var response = {
                                                                                    status: "success",
                                                                                    message: 'report generated',
                                                                                    pdfUrl: signedRes,
                                                                                    downloadPath: data.key
                                                                                };
                                                                                resolve(response);
                                                                            })
                                                                        });

                                                                    }
                                                                });
                                                            };
                                                            uploadFile();
                                                        });
                                                    }
                                                })
                                                .catch(function (err) {
                                                    console.log("error in converting HtmlToPdf", err);
                                                    resolve(err);
                                                    throw err;
                                                });
                                        }
                                    });
                                })
                                .catch(function (errEjsRender) {
                                  reject(errEjsRender);
                                });

                        }

                    });
                });

        } catch (exp) {
          return reject(exp);
        } 
    })
}

//PDF generation for instance observation score report
exports.instanceObservationScorePdfGeneration = async function instanceObservationPdfGeneration(observationResp, storeReportsToS3 = false, obj) {

    return new Promise(async function (resolve, reject) {

        var currentTempFolder = 'tmp/' + uuidv4() + "--" + Math.floor(Math.random() * (10000 - 10 + 1) + 10)

        var imgPath = __dirname + '/../' + currentTempFolder;

        try {

            if (!fs.existsSync(imgPath)) {
                fs.mkdirSync(imgPath);
            }

            let bootstrapStream = await copyBootStrapFile(__dirname + '/../public/css/bootstrap.min.css', imgPath + '/style.css');

            // let headerFile = await copyBootStrapFile(__dirname + '/../views/header.html', imgPath + '/header.html');
            let footerFile = await copyBootStrapFile(__dirname + '/../views/footer.html', imgPath + '/footer.html');

            //select all the multiselect response objects and create a chart object
            let chartObject = await getChartObject(observationResp.response);

            let formData = await createChart(chartObject, imgPath);

            let params;

            if (observationResp.solutionName) {
                params = {
                    solutionName: observationResp.solutionName
                }
            }
            else {
                params = {
                    observationName: observationResp.observationName
                }
            }
            ejs.renderFile(__dirname + '/../views/header.ejs', {
                data: params
            })
                .then(function (headerHtml) {

                    var dir = imgPath;
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir);
                    }

                    fs.writeFile(dir + '/header.html', headerHtml, async function (errWr, dataWr) {

                        if (errWr) {
                            throw errWr;
                        } else {

                            let arrayOfData = [];


                            await Promise.all(observationResp.response.map(async ele => {

                                let dt = formData.filter(or => {

                                    if (or.order == ele.order) {
                                        return or;
                                    }
                                })

                                arrayOfData.push(dt);

                            }))

                            obj.orderData = arrayOfData;

                            ejs.renderFile(__dirname + '/../views/instanceScoreObsTemplate.ejs', {
                                data: obj
                            })
                                .then(function (dataEjsRender) {

                                    var dir = imgPath;
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir);
                                    }

                                    fs.writeFile(dir + '/index.html', dataEjsRender, function (errWriteFile, dataWriteFile) {
                                        if (errWriteFile) {
                                            throw errWriteFile;
                                        } else {

                                            let optionsHtmlToPdf = gen.utils.getGotenbergConnection();
                                            optionsHtmlToPdf.formData = {
                                                files: [
                                                ]
                                            };
                                            formData.push({
                                                value: fs.createReadStream(dir + '/index.html'),
                                                options: {
                                                    filename: 'index.html'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/style.css'),
                                                options: {
                                                    filename: 'style.css'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/header.html'),
                                                options: {
                                                    filename: 'header.html'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/footer.html'),
                                                options: {
                                                    filename: 'footer.html'
                                                }
                                            });
                                            optionsHtmlToPdf.formData.files = formData;

                                            rp(optionsHtmlToPdf)
                                                .then(function (responseHtmlToPdf) {

                                                    var pdfBuffer = Buffer.from(responseHtmlToPdf.body);
                                                    if (responseHtmlToPdf.statusCode == 200) {

                                                        fs.writeFile(dir + '/pdfReport.pdf', pdfBuffer, 'binary', function (err) {
                                                            if (err) {
                                                                return console.log(err);
                                                            }

                                                            else {
                                                                const s3 = new AWS.S3(gen.utils.getAWSConnection());

                                                                const uploadFile = () => {

                                                                    fs.readFile(dir + '/pdfReport.pdf', (err, data) => {
                                                                        if (err) throw err;

                                                                        const params = {
                                                                            Bucket: process.env.AWS_BUCKET_NAME, // pass your bucket name
                                                                            Key: 'pdfReport/' + uuidv4() + 'pdfReport.pdf',
                                                                            Body: Buffer.from(data, null, 2),
                                                                            Expires: 10
                                                                        };

                                                                        if (storeReportsToS3 == false) {
                                                                            var folderPath = Buffer.from(currentTempFolder).toString('base64')

                                                                            var response = {
                                                                                status: "success",
                                                                                message: 'report generated',
                                                                                pdfUrl: folderPath,

                                                                            };
                                                                            resolve(response);

                                                                        } else {


                                                                            s3.upload(params, function (s3Err, data) {
                                                                                if (s3Err) throw s3Err;

                                                                                // console.log("data", data);
                                                                                console.log(`File uploaded successfully at ${data.Location}`);

                                                                                s3SignedUrl(data.key).then(function (signedRes) {

                                                                                    try {



                                                                                        fs.readdir(imgPath, (err, files) => {
                                                                                            if (err) throw err;

                                                                                            // console.log("files",files.length);
                                                                                            var i = 0;
                                                                                            for (const file of files) {

                                                                                                fs.unlink(path.join(imgPath, file), err => {
                                                                                                    if (err) throw err;
                                                                                                });

                                                                                                if (i == files.length) {
                                                                                                    fs.unlink('../../' + currentTempFolder, err => {
                                                                                                        if (err) throw err;

                                                                                                    });
                                                                                                    console.log("path.dirname(filename).split(path.sep).pop()", path.dirname(file).split(path.sep).pop());
                                                                                                    // fs.unlink(path.join(imgPath, ""), err => {
                                                                                                    //     if (err) throw err;
                                                                                                    // });
                                                                                                }

                                                                                                i = i + 1;

                                                                                            }
                                                                                        });
                                                                                        rimraf(imgPath, function () { console.log("done"); });

                                                                                    } catch (ex) {
                                                                                        console.log("ex ", ex);
                                                                                    }

                                                                                    var response = {
                                                                                        status: "success",
                                                                                        message: 'report generated',
                                                                                        pdfUrl: signedRes,
                                                                                        downloadPath: data.key
                                                                                    };
                                                                                    resolve(response);
                                                                                })
                                                                            });

                                                                        }

                                                                    });
                                                                }
                                                                uploadFile();
                                                            }
                                                        });

                                                    }

                                                }).catch(function (err) {
                                                    resolve(err);
                                                    throw err;
                                                });

                                        }

                                    });

                                }).catch(function (errEjsRender) {
                                    console.log("errEjsRender : ", errEjsRender);

                                    reject(errEjsRender);
                                });
                        }


                    });



                });
        }

        catch (err) {

        }

        finally {


        }

    })

}


// ============> PDF generation function for assessment API ======================>
exports.assessmentPdfGeneration = async function assessmentPdfGeneration(assessmentRes, storeReportsToS3 = false) {


    return new Promise(async function (resolve, reject) {

        var currentTempFolder = 'tmp/' + uuidv4() + "--" + Math.floor(Math.random() * (10000 - 10 + 1) + 10)

        var imgPath = __dirname + '/../' + currentTempFolder;

        // var FormData = [];


        try {

            var assessmentData = [assessmentRes.reportSections[0]]
            assessmentData[0].responseType = "stackedbar";
            var chartData = await getSelectedData(assessmentData, "stackedbar");

            // console.log("imgPath",imgPath);
            if (!fs.existsSync(imgPath)) {
                fs.mkdirSync(imgPath);
            }

            let bootstrapStream = await copyBootStrapFile(__dirname + '/../public/css/bootstrap.min.css', imgPath + '/style.css');

            // let headerFile = await copyBootStrapFile(__dirname + '/../views/header.html', imgPath + '/header.html');
            let footerFile = await copyBootStrapFile(__dirname + '/../views/footer.html', imgPath + '/footer.html');

            let FormData = [];

            let formDataAssessment = await apiCallToHighChart(chartData, imgPath, "stackedbar");

            FormData.push(...formDataAssessment);
            var params = {
                assessmentName: "Institutional Assessment Report"
            }
            ejs.renderFile(__dirname + '/../views/assessment_header.ejs', {
                data: params
            })
                .then(function (headerHtml) {
                    var dir = imgPath;
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir);
                    }
                    fs.writeFile(dir + '/header.html', headerHtml, function (errWr, dataWr) {
                        if (errWr) {
                            throw errWr;
                        } else {

                            var obj = {
                                path: formDataAssessment,
                            };
                            ejs.renderFile(__dirname + '/../views/stacked_bar_assessment_template.ejs', {
                                data: obj.path[0].options.filename,
                                assessmentData: assessmentRes.reportSections[1]
                            })
                                .then(function (dataEjsRender) {
                                    // console.log("dataEjsRender",imgPath);
                                    var dir = imgPath;
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir);
                                    }
                                    fs.writeFile(dir + '/index.html', dataEjsRender, function (errWriteFile, dataWriteFile) {
                                        if (errWriteFile) {
                                            throw errWriteFile;
                                        } else {

                                            let optionsHtmlToPdf = gen.utils.getGotenbergConnection();
                                            optionsHtmlToPdf.formData = {
                                                files: [
                                                ]
                                            };
                                            FormData.push({
                                                value: fs.createReadStream(dir + '/index.html'),
                                                options: {
                                                    filename: 'index.html'
                                                }
                                            });
                                            FormData.push({
                                                value: fs.createReadStream(dir + '/style.css'),
                                                options: {
                                                    filename: 'style.css'
                                                }
                                            });
                                            FormData.push({
                                                value: fs.createReadStream(dir + '/header.html'),
                                                options: {
                                                    filename: 'header.html'
                                                }
                                            });
                                            FormData.push({
                                                value: fs.createReadStream(dir + '/footer.html'),
                                                options: {
                                                    filename: 'footer.html'
                                                }
                                            });
                                            optionsHtmlToPdf.formData.files = FormData;
                                            // console.log("formData ===", optionsHtmlToPdf.formData.files);
                                            // optionsHtmlToPdf.formData.files.push(formDataMultiSelect);
                                            rp(optionsHtmlToPdf)
                                                .then(function (responseHtmlToPdf) {

                                                    // console.log("optionsHtmlToPdf", optionsHtmlToPdf.formData.files);
                                                    var pdfBuffer = Buffer.from(responseHtmlToPdf.body);
                                                    if (responseHtmlToPdf.statusCode == 200) {
                                                        fs.writeFile(dir + '/entityAssessmentReport.pdf', pdfBuffer, 'binary', function (err) {
                                                            if (err) {
                                                                return console.log(err);
                                                            }
                                                            // console.log("The PDF was saved!");
                                                            const s3 = new AWS.S3(gen.utils.getAWSConnection());
                                                            const uploadFile = () => {
                                                                fs.readFile(dir + '/entityAssessmentReport.pdf', (err, data) => {
                                                                    if (err) throw err;
                                                                    const params = {
                                                                        Bucket: process.env.AWS_BUCKET_NAME, // pass your bucket name
                                                                        Key: 'entityAssessmentPdfReports/' + uuidv4() + 'entityAssessmentReport.pdf', // file will be saved as testBucket/contacts.csv
                                                                        Body: Buffer.from(data, null, 2),
                                                                        Expires: 10
                                                                    };

                                                                    if (storeReportsToS3 == false) {
                                                                        var folderPath = Buffer.from(currentTempFolder).toString('base64')

                                                                        var response = {
                                                                            status: "success",
                                                                            message: 'report generated',
                                                                            pdfUrl: folderPath,

                                                                        };
                                                                        resolve(response);

                                                                    } else {


                                                                        s3.upload(params, function (s3Err, data) {
                                                                            if (s3Err) throw s3Err;

                                                                            // console.log("data", data);
                                                                            console.log(`File uploaded successfully at ${data.Location}`);

                                                                            s3SignedUrl(data.key).then(function (signedRes) {

                                                                                try {



                                                                                    fs.readdir(imgPath, (err, files) => {
                                                                                        if (err) throw err;

                                                                                        // console.log("files",files.length);
                                                                                        var i = 0;
                                                                                        for (const file of files) {

                                                                                            fs.unlink(path.join(imgPath, file), err => {
                                                                                                if (err) throw err;
                                                                                            });
                                                                                            if (i == files.length) {
                                                                                                fs.unlink('../../' + currentTempFolder, err => {
                                                                                                    if (err) throw err;
                                                                                                });
                                                                                                console.log("path.dirname(filename).split(path.sep).pop()", path.dirname(file).split(path.sep).pop());
                                                                                                // fs.unlink(path.join(imgPath, ""), err => {
                                                                                                //     if (err) throw err;
                                                                                                // });
                                                                                            }

                                                                                            i = i + 1;
                                                                                        }
                                                                                    });
                                                                                    rimraf(imgPath, function () { console.log("done"); });

                                                                                } catch (ex) {
                                                                                    console.log("ex ", ex);
                                                                                }

                                                                                var response = {
                                                                                    status: "success",
                                                                                    message: 'report generated',
                                                                                    pdfUrl: signedRes,
                                                                                    downloadPath: data.key
                                                                                };
                                                                                resolve(response);
                                                                            })
                                                                        });

                                                                    }
                                                                });
                                                            };
                                                            uploadFile();
                                                        });
                                                    }
                                                })
                                                .catch(function (err) {
                                                    console.log("error in converting HtmlToPdf", err);
                                                    resolve(err);
                                                    throw err;
                                                });
                                        }
                                    });
                                })
                                .catch(function (errEjsRender) {
                                    console.log("errEjsRender : ", errEjsRender);

                                    resolve(errEjsRender);
                                });

                        }

                    });
                });

        } catch (exp) {


        } finally {



            // fs.unlink(imgPath);
        }
    })

}

//Prepare chart object to send it to highchart server
async function getSelectedData(items, type) {

    return new Promise(async function (resolve, reject) {

        let arrayOfChartData = [];

        await Promise.all(items.map(async ele => {

            if (ele.responseType && ele.responseType == type) {
                var chartType = "bar";
                if (type == "radio") {
                    chartType = "pie";
                } else if (type == "stackedbar") {
                    chartType = "stackedbar";
                }

                let obj;

                if (chartType == "bar" || chartType == "pie") {

                    obj = await createChartObject(ele, chartType);

                } else if (chartType == "stackedbar") {
                    obj = {
                        type: "svg",
                        options: {
                            chart: {
                                type: 'bar'
                            },
                            colors: ['#D35400', '#F1C40F', '#3498DB', '#8E44AD', '#154360', '#145A32'],

                            title: {
                                text: ele.chart.title
                            },
                            xAxis: {
                                categories: ele.chart.xAxis.categories
                            },
                            yAxis: {
                                min: 0,
                                title: {
                                    text: ele.chart.yAxis.title.text
                                }
                            },
                            legend: {
                                reversed: true
                            },
                            plotOptions: {
                                series: {
                                    stacking: ele.chart.stacking,
                                    dataLabels: {
                                        enabled: true
                                    }
                                }
                            },
                            credits: {
                                enabled: false
                            },
                            series: ele.chart.data
                        }
                    }

                }
                arrayOfChartData.push(obj);
            }
        }));
        return resolve(arrayOfChartData);
    });
}



//Prepare chart object to send it to highchart server for observation score report
async function getScoreChartObject(items) {

    return new Promise(async function (resolve, reject) {

        let arrayOfChartData = [];

        await Promise.all(items.map(async ele => {

            let obj = await createScoreChartObject(ele);

            arrayOfChartData.push(obj);

        }));

        return resolve(arrayOfChartData);

    });
}




//Prepare chart object to send it to highchart server for criteria score report
async function getCriteriaScoreChartObject(items) {

    return new Promise(async function (resolve, reject) {

        let arrayOfChartData = [];

        await Promise.all(items.map(async element => {

            await Promise.all(element.questionArray.map(async ele => {

                let obj = await createScoreChartObject(ele);

                arrayOfChartData.push(obj);

            }));

        }));

        return resolve(arrayOfChartData);

    });
}



async function createScoreChartObject(ele) {

    return new Promise(async function (resolve, reject) {

        let obj;

        if (ele.chart.type == "pie") {

            obj = {
                order: ele.order,
                type: "svg",
                options: {
                    title: {
                        text: ele.question
                    },
                    // colors: ['#6c4fa1'],

                    chart: {
                        type: ele.chart.type
                    },
                    xAxis: ele.chart.xAxis,
                    yAxis: ele.chart.yAxis,
                    credits: ele.chart.credits,
                    plotOptions: ele.chart.plotOptions,
                    series: ele.chart.data
                },
                question: ele.question
            };
        }
        else if (ele.chart.type == "bar") {

            obj = {
                order: ele.order,
                type: "svg",
                options: {
                    title: {
                        text: ele.question
                    },
                    chart: {
                        type: ele.chart.type
                    },
                    colors: ['#D35400', '#F1C40F', '#3498DB', '#8E44AD', '#154360', '#145A32'],
                    xAxis: ele.chart.xAxis,
                    yAxis: ele.chart.yAxis,
                    credits: ele.chart.credits,
                    plotOptions: ele.chart.plotOptions,
                    legend: ele.chart.legend,
                    series: ele.chart.data
                },
                question: ele.question
            };
        }
        else if (ele.chart.type == "scatter") {

            obj = {
                order: ele.order,
                type: "svg",
                options: {
                    title: {
                        text: ""
                    },
                    chart: {
                        type: ele.chart.type
                    },
                    xAxis: ele.chart.xAxis,
                    yAxis: ele.chart.yAxis,
                    plotOptions: ele.chart.plotOptions,
                    credits: ele.chart.credits,
                    legend: ele.chart.legend,
                    series: ele.chart.data
                }
            };

            if (ele.question) {
                obj.question = ele.question;
                obj.options.title.text = ele.question;
            }

            if (ele.schoolName) {
                obj.options.title.text = ele.schoolName;
            }

        }
        else if (ele.chart.type == "column") {

            obj = {
                order: ele.order,
                type: "svg",
                options: {
                    title: {
                        text: ele.question
                    },
                    chart: {
                        type: ele.chart.type
                    },
                    xAxis: ele.chart.xAxis,
                    yAxis: ele.chart.yAxis,
                    plotOptions: ele.chart.plotOptions,
                    credits: ele.chart.credits,
                    legend: ele.chart.legend,
                    series: ele.chart.data
                },
                question: ele.question
            };
        }

        return resolve(obj);

    })
}

//Unnati monthly report pdf generation function
exports.unnatiViewFullReportPdfGeneration = async function (responseData, storeReportsToS3 = false) {

    return new Promise(async function (resolve, reject) {

        var currentTempFolder = 'tmp/' + uuidv4() + "--" + Math.floor(Math.random() * (10000 - 10 + 1) + 10)

        var imgPath = __dirname + '/../' + currentTempFolder;

        if (!fs.existsSync(imgPath)) {
            fs.mkdirSync(imgPath);
        }

        let bootstrapStream = await copyBootStrapFile(__dirname + '/../public/css/bootstrap.min.css', imgPath + '/style.css');

        try {

            var FormData = [];

            //get the chart object
            let chartObj = await ganttChartObject(responseData.projectDetails);

            //generate the chart using highchart server
            let ganttChartData = await createChart(chartObj[0], imgPath);

            FormData.push(...ganttChartData);

            let obj = {
                chartData: ganttChartData,
                reportType: responseData.reportType,
                projectData: chartObj[1],
                chartLibrary : "chartjs"
            }

            ejs.renderFile(__dirname + '/../views/unnatiViewFullReport.ejs', {
                data: obj

            })
                .then(function (dataEjsRender) {

                    var dir = imgPath;
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir);
                    }

                    fs.writeFile(dir + '/index.html', dataEjsRender, function (errWriteFile, dataWriteFile) {
                        if (errWriteFile) {
                            throw errWriteFile;
                        } else {

                            let optionsHtmlToPdf = gen.utils.getGotenbergConnection();
                            optionsHtmlToPdf.formData = {
                                files: [
                                ]
                            };
                            FormData.push({
                                value: fs.createReadStream(dir + '/index.html'),
                                options: {
                                    filename: 'index.html'
                                }
                            });
                            optionsHtmlToPdf.formData.files = FormData;


                            rp(optionsHtmlToPdf)
                                .then(function (responseHtmlToPdf) {

                                    var pdfBuffer = Buffer.from(responseHtmlToPdf.body);
                                    if (responseHtmlToPdf.statusCode == 200) {

                                        fs.writeFile(dir + '/pdfReport.pdf', pdfBuffer, 'binary', function (err) {
                                            if (err) {
                                                return console.log(err);
                                            }

                                            else {
                                                const s3 = new AWS.S3(gen.utils.getAWSConnection());

                                                const uploadFile = () => {

                                                    fs.readFile(dir + '/pdfReport.pdf', (err, data) => {
                                                        if (err) throw err;

                                                        const params = {
                                                            Bucket: process.env.AWS_BUCKET_NAME, // pass your bucket name
                                                            Key: 'pdfReport/' + uuidv4() + 'pdfReport.pdf',
                                                            Body: Buffer.from(data, null, 2),
                                                            Expires: 10
                                                        };

                                                        if (storeReportsToS3 == false) {
                                                            var folderPath = Buffer.from(currentTempFolder).toString('base64')

                                                            var response = {
                                                                status: "success",
                                                                message: 'report generated',
                                                                pdfUrl: folderPath,

                                                            };
                                                            resolve(response);

                                                        } else {


                                                            s3.upload(params, function (s3Err, data) {
                                                                if (s3Err) throw s3Err;

                                                                // console.log("data", data);
                                                                console.log(`File uploaded successfully at ${data.Location}`);

                                                                s3SignedUrl(data.key).then(function (signedRes) {

                                                                    try {



                                                                        fs.readdir(imgPath, (err, files) => {
                                                                            if (err) throw err;

                                                                            // console.log("files",files.length);
                                                                            var i = 0;
                                                                            for (const file of files) {

                                                                                fs.unlink(path.join(imgPath, file), err => {
                                                                                    if (err) throw err;
                                                                                });

                                                                                if (i == files.length) {
                                                                                    fs.unlink('../../' + currentTempFolder, err => {
                                                                                        if (err) throw err;

                                                                                    });
                                                                                    console.log("path.dirname(filename).split(path.sep).pop()", path.dirname(file).split(path.sep).pop());
                                                                                    // fs.unlink(path.join(imgPath, ""), err => {
                                                                                    //     if (err) throw err;
                                                                                    // });
                                                                                }

                                                                                i = i + 1;

                                                                            }
                                                                        });
                                                                        rimraf(imgPath, function () { console.log("done"); });

                                                                    } catch (ex) {
                                                                        console.log("ex ", ex);
                                                                    }

                                                                    var response = {
                                                                        status: "success",
                                                                        message: 'report generated',
                                                                        pdfUrl: signedRes,
                                                                        downloadPath: data.key
                                                                    };
                                                                    resolve(response);
                                                                })
                                                            });

                                                        }

                                                    });
                                                }
                                                uploadFile();
                                            }
                                        });
                                    }

                                }).catch(err => {
                                    resolve(err);
                                })
                        }
                    })
                })
        }
        catch (err) {
            resolve(err);
        }

    })
}


//PDF generation for instance criteria report
exports.instanceCriteriaReportPdfGeneration = async function (instanceResponse, storeReportsToS3 = false) {


    return new Promise(async function (resolve, reject) {

        var currentTempFolder = 'tmp/' + uuidv4() + "--" + Math.floor(Math.random() * (10000 - 10 + 1) + 10)

        var imgPath = __dirname + '/../' + currentTempFolder;


        try {

            if (!fs.existsSync(imgPath)) {
                fs.mkdirSync(imgPath);
            }

            let bootstrapStream = await copyBootStrapFile(__dirname + '/../public/css/bootstrap.min.css', imgPath + '/style.css');

            // let headerFile = await copyBootStrapFile(__dirname + '/../views/header.html', imgPath + '/header.html');
            let footerFile = await copyBootStrapFile(__dirname + '/../views/footer.html', imgPath + '/footer.html');

            let formData = [];

            let params = {
                observationName: instanceResponse.observationName
            }
            ejs.renderFile(__dirname + '/../views/header.ejs', {
                data: params
            })
                .then(function (headerHtml) {

                    var dir = imgPath;

                    fs.writeFile(dir + '/header.html', headerHtml, async function (err, dataWr) {
                        if (err) {
                            throw err;
                        } else {

                            var obj = {
                                response: instanceResponse.response
                            };
                            ejs.renderFile(__dirname + '/../views/instanceCriteriaTemplate.ejs', {
                                data: obj
                            })
                                .then(function (dataEjsRender) {

                                    var dir = imgPath;
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir);
                                    }
                                    fs.writeFile(dir + '/index.html', dataEjsRender, function (errWriteFile, dataWriteFile) {
                                        if (errWriteFile) {
                                            throw errWriteFile;
                                        } else {

                                            let optionsHtmlToPdf = gen.utils.getGotenbergConnection();
                                            optionsHtmlToPdf.formData = {
                                                files: [
                                                ]
                                            };
                                            formData.push({
                                                value: fs.createReadStream(dir + '/index.html'),
                                                options: {
                                                    filename: 'index.html'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/style.css'),
                                                options: {
                                                    filename: 'style.css'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/header.html'),
                                                options: {
                                                    filename: 'header.html'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/footer.html'),
                                                options: {
                                                    filename: 'footer.html'
                                                }
                                            });
                                            optionsHtmlToPdf.formData.files = formData;

                                            rp(optionsHtmlToPdf)
                                                .then(function (responseHtmlToPdf) {

                                                    // console.log("optionsHtmlToPdf", optionsHtmlToPdf.formData.files);
                                                    var pdfBuffer = Buffer.from(responseHtmlToPdf.body);
                                                    if (responseHtmlToPdf.statusCode == 200) {
                                                        fs.writeFile(dir + '/pdfReport.pdf', pdfBuffer, 'binary', function (err) {
                                                            if (err) {
                                                                return console.log(err);
                                                            }
                                                            // console.log("The PDF was saved!");
                                                            const s3 = new AWS.S3(gen.utils.getAWSConnection());
                                                            const uploadFile = () => {
                                                                fs.readFile(dir + '/pdfReport.pdf', (err, data) => {
                                                                    if (err) throw err;
                                                                    const params = {
                                                                        Bucket: process.env.AWS_BUCKET_NAME, // pass your bucket name
                                                                        Key: 'pdfReport/' + uuidv4() + 'pdfReport.pdf', // file will be saved as testBucket/contacts.csv
                                                                        Body: Buffer.from(data, null, 2),
                                                                        Expires: 10
                                                                    };

                                                                    if (storeReportsToS3 == false) {
                                                                        var folderPath = Buffer.from(currentTempFolder).toString('base64')

                                                                        var response = {
                                                                            status: "success",
                                                                            message: 'report generated',
                                                                            pdfUrl: folderPath,

                                                                        };
                                                                        resolve(response);

                                                                    } else {


                                                                        s3.upload(params, function (s3Err, data) {
                                                                            if (s3Err) throw s3Err;

                                                                            // console.log("data", data);
                                                                            console.log(`File uploaded successfully at ${data.Location}`);

                                                                            s3SignedUrl(data.key).then(function (signedRes) {

                                                                                try {



                                                                                    fs.readdir(imgPath, (err, files) => {
                                                                                        if (err) throw err;


                                                                                        var i = 0;
                                                                                        for (const file of files) {

                                                                                            fs.unlink(path.join(imgPath, file), err => {
                                                                                                if (err) throw err;
                                                                                            });

                                                                                            if (i == files.length) {
                                                                                                fs.unlink('../../' + currentTempFolder, err => {
                                                                                                    if (err) throw err;

                                                                                                });
                                                                                                console.log("path.dirname(filename).split(path.sep).pop()", path.dirname(file).split(path.sep).pop());
                                                                                                // fs.unlink(path.join(imgPath, ""), err => {
                                                                                                //     if (err) throw err;
                                                                                                // });
                                                                                            }

                                                                                            i = i + 1;

                                                                                        }
                                                                                    });
                                                                                    rimraf(imgPath, function () { console.log("done"); });

                                                                                } catch (ex) {
                                                                                    console.log("ex ", ex);
                                                                                }

                                                                                var response = {
                                                                                    status: "success",
                                                                                    message: 'report generated',
                                                                                    pdfUrl: signedRes,
                                                                                    downloadPath: data.key
                                                                                };
                                                                                resolve(response);
                                                                            })
                                                                        });

                                                                    }
                                                                });
                                                            };
                                                            uploadFile();
                                                        });
                                                    }
                                                })
                                                .catch(function (err) {
                                                    console.log("error in converting HtmlToPdf", err);
                                                    resolve(err);
                                                    throw err;
                                                });
                                        }
                                    });
                                })
                                .catch(function (errEjsRender) {
                                    console.log("errEjsRender : ", errEjsRender);

                                    reject(errEjsRender);
                                });

                        }

                    });
                });

        } catch (exp) {

        }
    })
}


// PDF generation function for entity report
exports.entityCriteriaPdfReportGeneration = async function (responseData, storeReportsToS3 = false) {

    return new Promise(async function (resolve, reject) {

        var currentTempFolder = 'tmp/' + uuidv4() + "--" + Math.floor(Math.random() * (10000 - 10 + 1) + 10)

        var imgPath = __dirname + '/../' + currentTempFolder;


        try {

            if (!fs.existsSync(imgPath)) {
                fs.mkdirSync(imgPath);
            }

            let bootstrapStream = await copyBootStrapFile(__dirname + '/../public/css/bootstrap.min.css', imgPath + '/style.css');

            // let headerFile = await copyBootStrapFile(__dirname + '/../views/header.html', imgPath + '/header.html');
            let footerFile = await copyBootStrapFile(__dirname + '/../views/footer.html', imgPath + '/footer.html');

            let multiSelectArray = [];
            let radioArray = [];
            let formData = [];

            await Promise.all(responseData.response.map(async singleResponse => {
                await Promise.all( singleResponse.questionArray.map( question => {
                    if (question.responseType == "multiselect") {
                        multiSelectArray.push(question);
                    }
                    else if (question.responseType == "radio") {
                        radioArray.push(question);
                    }
                }))
            }))
            
            //Prepare chart object before sending it to highchart server
            let multiSelectData = await getChartObject(multiSelectArray);
            let radioData = await getChartObject(radioArray);

            //send chart objects to highchart server and get the charts
            let multiselectFormData = await createChart(multiSelectData, imgPath);
            let radioFormData = await createChart(radioData, imgPath);

            formData.push(...multiselectFormData);
            formData.push(...radioFormData);

            let params = {
                observationName: responseData.observationName
            }

            ejs.renderFile(__dirname + '/../views/header.ejs', {
                data: params
            })
                .then(function (headerHtml) {

                    var dir = imgPath;
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir);
                    }
                    fs.writeFile(dir + '/header.html', headerHtml, async function (errWr, dataWr) {
                        if (errWr) {
                            throw errWr;
                        } else {

                            let obj = {
                                response: responseData.response,
                                radioData: radioFormData,
                                multiselectData: multiselectFormData
                            };
                            ejs.renderFile(__dirname + '/../views/entityCriteriaTemplate.ejs', {
                                data: obj
                            })
                                .then(function (dataEjsRender) {

                                    var dir = imgPath;
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir);
                                    }
                                    fs.writeFile(dir + '/index.html', dataEjsRender, function (errWriteFile, dataWriteFile) {
                                        if (errWriteFile) {
                                            throw errWriteFile;
                                        } else {

                                            let optionsHtmlToPdf = gen.utils.getGotenbergConnection();
                                            optionsHtmlToPdf.formData = {
                                                files: [
                                                ]
                                            };
                                            formData.push({
                                                value: fs.createReadStream(dir + '/index.html'),
                                                options: {
                                                    filename: 'index.html'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/style.css'),
                                                options: {
                                                    filename: 'style.css'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/header.html'),
                                                options: {
                                                    filename: 'header.html'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/footer.html'),
                                                options: {
                                                    filename: 'footer.html'
                                                }
                                            });
                                            optionsHtmlToPdf.formData.files = formData;

                                            rp(optionsHtmlToPdf)
                                                .then(function (responseHtmlToPdf) {

                                                    // console.log("optionsHtmlToPdf", optionsHtmlToPdf.formData.files);
                                                    var pdfBuffer = Buffer.from(responseHtmlToPdf.body);
                                                    if (responseHtmlToPdf.statusCode == 200) {
                                                        fs.writeFile(dir + '/pdfReport.pdf', pdfBuffer, 'binary', function (err) {
                                                            if (err) {
                                                                return console.log(err);
                                                            }
                                                            // console.log("The PDF was saved!");
                                                            const s3 = new AWS.S3(gen.utils.getAWSConnection());
                                                            const uploadFile = () => {
                                                                fs.readFile(dir + '/pdfReport.pdf', (err, data) => {
                                                                    if (err) throw err;
                                                                    const params = {
                                                                        Bucket: process.env.AWS_BUCKET_NAME, // pass your bucket name
                                                                        Key: 'pdfReport/' + uuidv4() + 'pdfReport.pdf', // file will be saved as testBucket/contacts.csv
                                                                        Body: Buffer.from(data, null, 2),
                                                                        Expires: 10
                                                                    };

                                                                    if (storeReportsToS3 == false) {
                                                                        var folderPath = Buffer.from(currentTempFolder).toString('base64')

                                                                        var response = {
                                                                            status: "success",
                                                                            message: 'report generated',
                                                                            pdfUrl: folderPath,

                                                                        };
                                                                        resolve(response);

                                                                    } else {


                                                                        s3.upload(params, function (s3Err, data) {
                                                                            if (s3Err) throw s3Err;


                                                                            console.log(`File uploaded successfully at ${data.Location}`);

                                                                            s3SignedUrl(data.key).then(function (signedRes) {

                                                                                try {



                                                                                    fs.readdir(imgPath, (err, files) => {
                                                                                        if (err) throw err;

                                                                                        // console.log("files",files.length);
                                                                                        var i = 0;
                                                                                        for (const file of files) {

                                                                                            fs.unlink(path.join(imgPath, file), err => {
                                                                                                if (err) throw err;
                                                                                            });

                                                                                            if (i == files.length) {
                                                                                                fs.unlink('../../' + currentTempFolder, err => {
                                                                                                    if (err) throw err;

                                                                                                });
                                                                                                console.log("path.dirname(filename).split(path.sep).pop()", path.dirname(file).split(path.sep).pop());
                                                                                                // fs.unlink(path.join(imgPath, ""), err => {
                                                                                                //     if (err) throw err;
                                                                                                // });
                                                                                            }

                                                                                            i = i + 1;

                                                                                        }
                                                                                    });
                                                                                    rimraf(imgPath, function () { console.log("done"); });

                                                                                } catch (ex) {
                                                                                    console.log("ex ", ex);
                                                                                }

                                                                                var response = {
                                                                                    status: "success",
                                                                                    message: 'report generated',
                                                                                    pdfUrl: signedRes,
                                                                                    downloadPath: data.key
                                                                                };
                                                                                resolve(response);
                                                                            })
                                                                        });

                                                                    }
                                                                });
                                                            };
                                                            uploadFile();
                                                        });
                                                    }
                                                })
                                                .catch(function (err) {
                                                    resolve(err);
                                                    throw err;
                                                });
                                        }
                                    });
                                })
                                .catch(function (errEjsRender) {
                                    console.log("errEjsRender : ", errEjsRender);

                                    reject(errEjsRender);
                                });

                        }

                    });
                });

        } catch (exp) {
            console.log(exp);
        }
    })

}

async function createChartObject(ele, chartType) {

    return new Promise(async function (resolve, reject) {

        let obj = {
            order: ele.order,
            type: "svg",
            options: {
                title: {
                    text: ele.question
                },
                colors: ['#D35400', '#F1C40F', '#3498DB', '#8E44AD', '#154360', '#145A32'],

                chart: {
                    type: chartType


                },
                plotOptions: ele.chart.plotOptions,
                xAxis: ele.chart.xAxis,
                yAxis: ele.chart.yAxis,
                credits: {
                    enabled: false
                },
                series: ele.chart.data
            },
            question: ele.question
        };

        resolve(obj);

    })

}

//PDF generation for instance observation score report
exports.instanceScoreCriteriaPdfGeneration = async function (observationResp, storeReportsToS3 = false, obj) {

    return new Promise(async function (resolve, reject) {

        var currentTempFolder = 'tmp/' + uuidv4() + "--" + Math.floor(Math.random() * (10000 - 10 + 1) + 10)

        var imgPath = __dirname + '/../' + currentTempFolder;

        try {

            if (!fs.existsSync(imgPath)) {
                fs.mkdirSync(imgPath);
            }

            let bootstrapStream = await copyBootStrapFile(__dirname + '/../public/css/bootstrap.min.css', imgPath + '/style.css');

            // let headerFile = await copyBootStrapFile(__dirname + '/../views/header.html', imgPath + '/header.html');
            let footerFile = await copyBootStrapFile(__dirname + '/../views/footer.html', imgPath + '/footer.html');
            
            let chartDataArray = [];

            await Promise.all(observationResp.response.map(async questionData => {
    
                await Promise.all(questionData.questionArray.map(async singleQuestion => {
    
                    chartDataArray.push(singleQuestion);
                }));
            }));

            let chartObj = await getChartObject(chartDataArray);

            let formData = await createChart(chartObj, imgPath);

            let params = {
                observationName: observationResp.observationName
            }

            ejs.renderFile(__dirname + '/../views/header.ejs', {
                data: params
            })
                .then(function (headerHtml) {

                    var dir = imgPath;
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir);
                    }

                    fs.writeFile(dir + '/header.html', headerHtml, async function (errWr, dataWr) {

                        if (errWr) {
                            throw errWr;
                        } else {


                            obj.response = observationResp.response;
                            obj.highChartData = formData;

                            ejs.renderFile(__dirname + '/../views/scoreCriteriaTemplate.ejs', {
                                data: obj
                            })
                                .then(function (dataEjsRender) {

                                    var dir = imgPath;
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir);
                                    }

                                    fs.writeFile(dir + '/index.html', dataEjsRender, function (errWriteFile, dataWriteFile) {
                                        if (errWriteFile) {
                                            throw errWriteFile;
                                        } else {

                                            let optionsHtmlToPdf = gen.utils.getGotenbergConnection();
                                            optionsHtmlToPdf.formData = {
                                                files: [
                                                ]
                                            };
                                            formData.push({
                                                value: fs.createReadStream(dir + '/index.html'),
                                                options: {
                                                    filename: 'index.html'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/style.css'),
                                                options: {
                                                    filename: 'style.css'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/header.html'),
                                                options: {
                                                    filename: 'header.html'
                                                }
                                            });
                                            formData.push({
                                                value: fs.createReadStream(dir + '/footer.html'),
                                                options: {
                                                    filename: 'footer.html'
                                                }
                                            });
                                            optionsHtmlToPdf.formData.files = formData;

                                            rp(optionsHtmlToPdf)
                                                .then(function (responseHtmlToPdf) {

                                                    var pdfBuffer = Buffer.from(responseHtmlToPdf.body);
                                                    if (responseHtmlToPdf.statusCode == 200) {

                                                        fs.writeFile(dir + '/pdfReport.pdf', pdfBuffer, 'binary', function (err) {
                                                            if (err) {
                                                                return console.log(err);
                                                            }

                                                            else {
                                                                const s3 = new AWS.S3(gen.utils.getAWSConnection());

                                                                const uploadFile = () => {

                                                                    fs.readFile(dir + '/pdfReport.pdf', (err, data) => {
                                                                        if (err) throw err;

                                                                        const params = {
                                                                            Bucket: process.env.AWS_BUCKET_NAME, // pass your bucket name
                                                                            Key: 'pdfReport/' + uuidv4() + 'pdfReport.pdf',
                                                                            Body: Buffer.from(data, null, 2),
                                                                            Expires: 10
                                                                        };

                                                                        if (storeReportsToS3 == false) {
                                                                            var folderPath = Buffer.from(currentTempFolder).toString('base64')

                                                                            var response = {
                                                                                status: "success",
                                                                                message: 'report generated',
                                                                                pdfUrl: folderPath,

                                                                            };
                                                                            resolve(response);

                                                                        } else {


                                                                            s3.upload(params, function (s3Err, data) {
                                                                                if (s3Err) throw s3Err;

                                                                                // console.log("data", data);
                                                                                console.log(`File uploaded successfully at ${data.Location}`);

                                                                                s3SignedUrl(data.key).then(function (signedRes) {

                                                                                    try {



                                                                                        fs.readdir(imgPath, (err, files) => {
                                                                                            if (err) throw err;

                                                                                            // console.log("files",files.length);
                                                                                            var i = 0;
                                                                                            for (const file of files) {

                                                                                                fs.unlink(path.join(imgPath, file), err => {
                                                                                                    if (err) throw err;
                                                                                                });

                                                                                                if (i == files.length) {
                                                                                                    fs.unlink('../../' + currentTempFolder, err => {
                                                                                                        if (err) throw err;

                                                                                                    });
                                                                                                    console.log("path.dirname(filename).split(path.sep).pop()", path.dirname(file).split(path.sep).pop());
                                                                                                    // fs.unlink(path.join(imgPath, ""), err => {
                                                                                                    //     if (err) throw err;
                                                                                                    // });
                                                                                                }

                                                                                                i = i + 1;

                                                                                            }
                                                                                        });
                                                                                        rimraf(imgPath, function () { console.log("done"); });

                                                                                    } catch (ex) {
                                                                                        console.log("ex ", ex);
                                                                                    }

                                                                                    var response = {
                                                                                        status: "success",
                                                                                        message: 'report generated',
                                                                                        pdfUrl: signedRes,
                                                                                        downloadPath: data.key
                                                                                    };
                                                                                    resolve(response);
                                                                                })
                                                                            });

                                                                        }

                                                                    });
                                                                }
                                                                uploadFile();
                                                            }
                                                        });

                                                    }

                                                }).catch(function (err) {
                                                    console.log("error in converting HtmlToPdf", err);
                                                    resolve(err);
                                                    throw err;
                                                });

                                        }

                                    });

                                }).catch(function (errEjsRender) {
                                    console.log("errEjsRender : ", errEjsRender);

                                    reject(errEjsRender);
                                });
                        }


                    });



                });
        }

        catch (err) {
            console.log(err);
        }
    })

}


// gantt chart for unnati pdf report
async function ganttChartObject(projects) {

    return new Promise(async function (resolve, reject) {
        
        let arrayOfChartData = [];
        let projectData = [];
        let i = 1;

        await Promise.all(projects.map(async eachProject => {
             
            let data = [];
            let labels = [];
            let leastStartDate = "";

            await Promise.all(eachProject.tasks.map(eachTask => {
                if(eachTask.startDate) {
                  leastStartDate = eachTask.startDate;
                }
                labels.push(eachTask.title);
                data.push({
                    task: eachTask.title,
                    startDate:eachTask.startDate,
                    endDate: eachTask.endDate
                })
            }))

            if (data.length > 0) {
                data.forEach(v => {
                leastStartDate = new Date(v.startDate) < new Date(leastStartDate) ? v.startDate : leastStartDate;
                })
            }

            let chartOptions = {
                order: 1,
                options: {
                    type: 'horizontalBar',
                    data: {
                        labels: labels, 
                        datasets: [
                        {
                        data: data.map((t) => {
                          if (leastStartDate && t.startDate) {
                          return dateDiffInDays(new Date(leastStartDate), new Date(t.startDate));
                          }
                        }),
                        datalabels: {
                          color: '#025ced',
                        //   formatter: function (value, context) {
                        //     return '';
                        //   },
                        },
                        backgroundColor: 'rgba(63,103,126,0)',
                        hoverBackgroundColor: 'rgba(50,90,100,0)',
                      },
                      {
                        data: data.map((t) => {
                            if (t.startDate && t.endDate) {
                              return dateDiffInDays(new Date(t.startDate), new Date(t.endDate));
                            }
                        }),
                        datalabels: {
                          color: '#025ced',
                        //   formatter: function (value, context) {
                        //     return '';
                        //   },
                        },
                      },
                    ]
                    },
                    options : {
                     maintainAspectRatio: false,
                     title: {
                        display: true,
                        text: eachProject.title
                       },
                    legend: { display: false },
                    scales: {
                    xAxes: [
                        {
                          stacked: true,
                          ticks: {
                            callback: function (value, index, values) {
                              if (leastStartDate) {
                              const date = new Date(leastStartDate);
                              date.setDate(value);
                              return getDate(date);
                              }
                            },
                          },
                        },
                    ],
                      yAxes: [
                        {
                          stacked: true,
                        },
                      ],
                    }
                    }
                }
            }
            
            arrayOfChartData.push(chartOptions);
            eachProject.order = i;
            projectData.push(eachProject);
            i++;
        
        }))

        resolve([arrayOfChartData, projectData]);
    })
}

function getDate(date) {
    return (
      date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).substr(-2) + '-' + ('0' + date.getDate()).substr(-2)
    );
}

function dateDiffInDays(a, b) {
    const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

//Unnati redesign entity report pdf generation function
exports.unnatiEntityReportPdfGeneration = async function (entityReportData, storeReportsToS3 = false) {

    return new Promise(async function (resolve, reject) {

        let currentTempFolder = 'tmp/' + uuidv4() + "--" + Math.floor(Math.random() * (10000 - 10 + 1) + 10)

        let imgPath = __dirname + '/../' + currentTempFolder;

        if (!fs.existsSync(imgPath)) {
            fs.mkdirSync(imgPath);
        }

        let bootstrapStream = await copyBootStrapFile(__dirname + '/../public/css/bootstrap.min.css', imgPath + '/style.css');

        try {
            let formData = [];

            //copy images from public folder
            let imgSourcePaths = ['/../public/images/note1.svg', '/../public/images/note2.svg', '/../public/images/note3.svg', '/../public/images/note4.svg']

            for (let i = 0; i < imgSourcePaths.length; i++) {

                let imgName = "note" + (i + 1) + ".svg";
                let src = __dirname + imgSourcePaths[i];
                fs.copyFileSync(src, imgPath + ('/' + imgName));

                formData.push({
                    value: fs.createReadStream(imgPath + ('/' + imgName)),
                    options: {
                        filename: imgName,
                    }
                })
            }

            //get the chart object
            let chartData = await getEntityReportChartObjects(entityReportData);

            //generate the chart using highchart server
            let entityReportCharts = await createChart(chartData, imgPath);

            formData.push(...entityReportCharts);

            let ejsInputData = {
                chartData: entityReportCharts,
                response: entityReportData
            }

            ejs.renderFile(__dirname + '/../views/unnatiEntityReport.ejs', {
                data: ejsInputData
            })
                .then(function (dataEjsRender) {

                    let dir = imgPath;
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir);
                    }

                    fs.writeFile(dir + '/index.html', dataEjsRender, function (errWriteFile, dataWriteFile) {
                        if (errWriteFile) {
                            throw errWriteFile;
                        } else {

                            let optionsHtmlToPdf = gen.utils.getGotenbergConnection();
                            optionsHtmlToPdf.formData = {
                                files: []
                            };
                            formData.push({
                                value: fs.createReadStream(dir + '/index.html'),
                                options: {
                                    filename: 'index.html'
                                }
                            });
                            optionsHtmlToPdf.formData.files = formData;

                            rp(optionsHtmlToPdf)
                                .then(function (responseHtmlToPdf) {

                                    var pdfBuffer = Buffer.from(responseHtmlToPdf.body);
                                    if (responseHtmlToPdf.statusCode == 200) {

                                        fs.writeFile(dir + '/pdfReport.pdf', pdfBuffer, 'binary', function (err) {
                                            if (err) {
                                                return console.log(err);
                                            }

                                            else {
                                                const s3 = new AWS.S3(gen.utils.getAWSConnection());

                                                const uploadFile = () => {

                                                    fs.readFile(dir + '/pdfReport.pdf', (err, data) => {
                                                        if (err) throw err;

                                                        const params = {
                                                            Bucket: process.env.AWS_BUCKET_NAME, // pass your bucket name
                                                            Key: 'pdfReport/' + uuidv4() + 'pdfReport.pdf',
                                                            Body: Buffer.from(data, null, 2),
                                                            Expires: 10
                                                        };

                                                        if (storeReportsToS3 == false) {
                                                            let folderPath = Buffer.from(currentTempFolder).toString('base64')

                                                            let response = {
                                                                status: "success",
                                                                message: 'report generated',
                                                                pdfUrl: folderPath,

                                                            };
                                                            resolve(response);

                                                        } else {


                                                            s3.upload(params, function (s3Err, data) {
                                                                if (s3Err) throw s3Err;

                                                                console.log(`File uploaded successfully at ${data.Location}`);

                                                                s3SignedUrl(data.key).then(function (signedRes) {

                                                                    try {

                                                                        fs.readdir(imgPath, (err, files) => {
                                                                            if (err) throw err;

                                                                            let i = 0;
                                                                            for (const file of files) {

                                                                                fs.unlink(path.join(imgPath, file), err => {
                                                                                    if (err) throw err;
                                                                                });

                                                                                if (i == files.length) {
                                                                                    fs.unlink('../../' + currentTempFolder, err => {
                                                                                        if (err) throw err;

                                                                                    });
                                                                                }

                                                                                i = i + 1;

                                                                            }
                                                                        });
                                                                        rimraf(imgPath, function () { console.log("done"); });

                                                                    } catch (ex) {
                                                                        console.log("ex ", ex);
                                                                    }

                                                                    let response = {
                                                                        status: "success",
                                                                        message: 'report generated',
                                                                        pdfUrl: signedRes,
                                                                        downloadPath: data.key
                                                                    };
                                                                    resolve(response);
                                                                })
                                                            });

                                                        }

                                                    });
                                                }
                                                uploadFile();
                                            }
                                        });
                                    }

                                }).catch(err => {
                                    resolve(err);
                                })
                        }
                    })
                })
        }
        catch (err) {
            resolve(err);
        }
    })
}

async function getEntityReportChartObjects(data) {

    return new Promise(async function (resolve, reject) {

        let chartData = [];

        let getChartObjects = [
            getTaskOverviewChart(data.tasks),
            getCategoryWiseChart(data.categories)
        ];

        await Promise.all(getChartObjects)
            .then(function (response) {
                chartData.push(response[0]);
                chartData.push(response[1]);
            });

        return resolve(chartData)


    })
}

async function getTaskOverviewChart(tasks) {
    return new Promise(async function (resolve, reject) {


        let total = tasks['Total'];
        delete tasks['Total'];

        let labels = [];
        let data = [];
        let backgroundColor = [];

        if (tasks["Completed"]) {
            labels.push("Completed");
            data.push(((tasks["Completed"] / total) * 100).toFixed(1));
            backgroundColor.push("#295e28");
            delete tasks["Completed"];
        }

        if (tasks["Not Started"]) {
            labels.push("Not Started");
            data.push(((tasks["Not Started"] / total) * 100).toFixed(1));
            backgroundColor.push("#db0b0b");
            delete tasks["Not Started"];
        }

        Object.keys(tasks).forEach(eachTask => {
            let percetage = ((tasks[eachTask] / total) * 100).toFixed(1);
            labels.push(eachTask);
            data.push(percetage);
        })
        
        backgroundColor = [...backgroundColor, ...['rgb(255, 99, 132)','rgb(54, 162, 235)','rgb(255, 206, 86)','rgb(231, 233, 237)','rgb(75, 192, 192)','rgb(151, 187, 205)','rgb(220, 220, 220)','rgb(247, 70, 74)','rgb(70, 191, 189)','rgb(253, 180, 92)','rgb(148, 159, 177)','rgb(77, 83, 96)','rgb(95, 101, 217)','rgb(170, 95, 217)','rgb(140, 48, 57)','rgb(209, 6, 40)','rgb(68, 128, 51)','rgb(125, 128, 51)','rgb(128, 84, 51)','rgb(179, 139, 11)']];
      
        let chartOptions = {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: backgroundColor,
                }]
            },
            options: {
                cutoutPercentage: 80,
                legend: {
                    position: "bottom"
                },
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        font: {
                            size: 18,
                        },
                        formatter: (value) => {
                          return value + '%';;
                        }
                    }
                }
            },
        };

        let chartObject = {
            order: 1,
            options: chartOptions
        };

        resolve(chartObject);
    })
}

async function getCategoryWiseChart(categories) {
    return new Promise(async function (resolve, reject) {

        let total = categories['Total'];
        delete categories['Total'];
        let labels = [];
        let data = [];

        Object.keys(categories).forEach(eachCategory => {
            let percetage = ((categories[eachCategory] / total) * 100).toFixed(1);
            labels.push(eachCategory);
            data.push(percetage);
        });

        let chartOptions = {
            type: 'doughnut',
            data: {
              labels: labels,
              datasets: [{
                data: data,
                backgroundColor: ['rgb(255, 99, 132)','rgb(54, 162, 235)','rgb(255, 206, 86)','rgb(231, 233, 237)','rgb(75, 192, 192)','rgb(151, 187, 205)','rgb(220, 220, 220)','rgb(247, 70, 74)','rgb(70, 191, 189)','rgb(253, 180, 92)','rgb(148, 159, 177)','rgb(77, 83, 96)','rgb(95, 101, 217)','rgb(170, 95, 217)','rgb(140, 48, 57)','rgb(209, 6, 40)','rgb(68, 128, 51)','rgb(125, 128, 51)','rgb(128, 84, 51)','rgb(179, 139, 11)']
              }]
            },
            options: {
                legend: {
                   position: "bottom",
                   labels: {
                    padding: 30,
                }
                },
                layout: {
                    padding: {
                      top: 15,
                      bottom: 25
                    },
                },
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        font: {
                            size: 18,
                        },
                        formatter: (value) => {
                          return value + '%';
                        }
                    }
                }
            }
        };

        let chartObject = {
            order: 2,
            options: chartOptions
        };
        resolve(chartObject);
    })
}


async function copyBootStrapFile(from, to) {
    // var fileInfo = await rp(options).pipe(fs.createWriteStream(radioFilePath))
    var readCss = fs.createReadStream(from).pipe(fs.createWriteStream(to));
    return new Promise(function (resolve, reject) {
        readCss.on('finish', function () {
            // console.log("readCss", readCss);
            return resolve(readCss);
        });
        readCss.on('error', function (err) {
            // return resolve(fileInfo);
            // console.log("err--", err);
            return resolve(err)
        });
    });
}

//Prepare chartData for chartjs
const getChartObject = async function (data) {

    let chartOptions = [];

    await Promise.all(data.map(chartData => {
        let chartObj = {
            order: chartData.order,
            options: chartData.chart,
            question: chartData.question
        };
       
        if (!chartObj.options.options) {
           chartObj.options.options = {
               plugin : {}
           };
        }
        chartObj.options.options.title = {
            display: true,
            text: chartData.question,
            fontSize: 22
        };
        
        if (chartObj.options.type == "horizontalBar")
        if (!chartObj.options.options.scales["yAxes"] || !chartObj.options.options.scales["yAxes"][0]["ticks"] ) {
            if (!chartObj.options.options.scales["yAxes"]) {
               chartObj.options.options.scales["yAxes"] = [{}];
            }
            
            chartObj.options.options.scales["yAxes"][0]["ticks"] = {
                callback: function (value, index, values) {
                  let strArr = value.split(' ');
                  let tempString = '';
                  let result = [];
                  for (let x = 0; x < strArr.length; x++) {
                    tempString += ' ' + strArr[x];
                    if ((x % 5 === 0 && x !== 0) || x == strArr.length - 1) {
                      tempString = tempString.slice(1);
                      result.push(tempString);
                      tempString = '';
                    }
                  }
                  return result || value;
                },
                fontSize: 12,
            }
        }

        chartOptions.push(chartObj)
    }))

    return chartOptions;
}

// Chart creation using chartjs
const createChart = async function (chartData, imgPath) {

    return new Promise(async function (resolve, reject) {

        try {

            let formData = [];

            await Promise.all(chartData.map(async data => {
                let chartImage = "chartPngImage_" + uuidv4() + "_.png";

                let imgFilePath = imgPath + "/" + chartImage;

                let imageBuffer = await chartJSNodeCanvas.renderToBuffer(data.options);
                fs.writeFileSync(imgFilePath, imageBuffer);

                formData.push({
                    order: data.order,
                    value: fs.createReadStream(imgFilePath),
                    options: {
                        filename: chartImage,
                    }
                })

            }))

            return resolve(formData)
        }
        catch (err) {
            return reject(err);
        }
    })
}
