var http = require("http");
var url = require("url");
var request = require("request");
var xml2js = require("xml2js");
var Canvas = require("canvas");

const PORT = 8080;
const CIRCLE_CI_URL = "https://circleci.com/api/v1/project";
const AUTHOR = "author";
const PROJECT = "project";
const CIRCLE_TOKEN = "circle-token";

var params = null;

function handleRequest(httpRequest, httpResponse) {
    params = url.parse(httpRequest.url, true).query;
    console.log("[INF0] Received request: " + JSON.stringify(params));

    if(params[AUTHOR] && params[PROJECT] && params[CIRCLE_TOKEN]) {
        var latest_build_url = CIRCLE_CI_URL + "/" + params[AUTHOR] + "/" + params[PROJECT] + "?" + CIRCLE_TOKEN + "=" + params[CIRCLE_TOKEN] + "&limit=1";
        request({
            url: latest_build_url,
            json: true
        }, function(error, response, body) {
            if(!error && response.statusCode === 200) {
                getBadge(body, function(badge) {
                    httpResponse.writeHead(200, {
                        'Content-Type': 'image/png'
                    });
                    httpResponse.end(badge, "binary");
                });
            } else {
                httpResponse.writeHead(200, {
                    'Content-Type': 'image/png'
                });
                httpResponse.end(generateBadge({}, true), "binary");
            }
        });
    }
}

function getBadge(builds, callback) {
    var artifact_url = CIRCLE_CI_URL + "/" + params[AUTHOR] + "/" + params[PROJECT] + "/" + builds[0].build_num + "/artifacts?" + CIRCLE_TOKEN + "=" + params[CIRCLE_TOKEN];
    request({
        url: artifact_url,
        json: true
    }, function(error, response, body) {
        if(!error && response.statusCode === 200) {
            handleArtifacts(body, function(testReport) {
                callback(testReport);
            });
        }
    });
}

function handleArtifacts(artifacts, callback) {
    artifacts.forEach(function(artifact) {
        if(/jacocoTestReport.xml$/.test(artifact.path)) {
            request({
                url: artifact.url + "?" + CIRCLE_TOKEN + "=" + params[CIRCLE_TOKEN]
            }, function(error, response, body) {
                xml2js.parseString(body, function(err, result) {
                    result.report.counter.forEach(function(element) {
                        if(element.$.type === "INSTRUCTION") {
                            callback(generateBadge(element.$, false));
                        }
                    });
                });
            });
        }
    });
}

function generateBadge(coverage, error) {
    var width = 90;
    var height = 18;
    var radius = 10;

    var canvas = new Canvas(width, height);
    var context = canvas.getContext('2d');

    context.antialias = "subpixel";

    if(!error) {
        var covered = parseInt(coverage.covered);
        var missed = parseInt(coverage.missed);

        var percentage = Math.round((covered / (covered + missed)) * 100);
    }

    var color = "green";
    if(color >= 70 && color < 85) {
        color = "orange";
    } else if(color < 70 || error) {
        color = "red"
    }

    context.beginPath();
    context.strokeStyle = "#555555";
    context.fillStyle = "#555555";

    context.lineJoin = "round";
    context.lineWidth = radius;

    context.strokeRect(radius / 2, radius / 2, width - radius, height - radius);
    context.fillRect(radius / 2, radius / 2, width - radius, height - radius);

    context.lineJoin = "miter";
    context.moveTo(50 + (radius / 2), 0);
    context.lineTo(50 + (radius / 2), height);
    context.stroke();
    context.closePath();

    context.beginPath();
    context.lineJoin = "round";
    context.strokeStyle = color;
    context.fillStyle = color;

    context.strokeRect(60 + (radius / 2), radius/2, width - radius - 60, height - radius);
    context.fillRect(60 + (radius / 2), radius / 2, width - radius - 60, height-radius);

    context.lineJoin = "miter";
    context.moveTo(60 + (radius / 2), 0);
    context.lineTo(60 + (radius / 2), height);
    context.stroke();
    context.closePath();

    context.strokeStyle = "#eeeeee";
    context.fillStyle = "#eeeeee";
    context.lineWidth = 1;
    context.lineJoin = "miter";

    context.font = "600 7.5pt sans-serif";
    context.fillText("coverage", 3.5, 12);

    if(!error) {
        context.font = "600 8pt sans-serif";
        context.fillText(percentage + "%", 62, 12.5);
    } else {
        context.font = "bold 8pt sans-serif";
        context.fillText("??%", 62, 12.5);
    }

    return canvas.toBuffer();
}

var server = http.createServer(handleRequest);

server.listen(PORT, function(){
    console.log("Server listening on port", PORT);
});