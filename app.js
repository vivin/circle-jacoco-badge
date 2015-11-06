var http = require("http");
var dispatcher = require("httpdispatcher");
var etag = require('etag');
var url = require("url");
var request = require("request");
var xml2js = require("xml2js");
var Canvas = require("canvas");

const PORT = (process.env.PORT || 5000);
const CIRCLE_CI_URL = "https://circleci.com/api/v1/project";
const AUTHOR = "author";
const PROJECT = "project";
const CIRCLE_TOKEN = "circle-token";
const TYPE = "type";

var params = null;

function handleRequest(httpRequest, httpResponse) {
    try {
        console.log("[INFO]", httpRequest.url, "from", httpRequest.headers.referer);
        dispatcher.dispatch(httpRequest, httpResponse);
    } catch(err) {
        console.log("[ERROR]", err);

        var badge = generateBadge({}, true);
        httpResponse.writeHead(500, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache',
            'Etag': etag(badge)
        });
        httpResponse.end(badge, "binary");
    }
}

dispatcher.onGet("/badge", function(httpRequest, httpResponse) {
    getRequestHandler(httpRequest, httpResponse, "line");
});

dispatcher.onGet("/line", function(httpRequest, httpResponse) {
    getRequestHandler(httpRequest, httpResponse, "line");
});

dispatcher.onGet("/branch", function(httpRequest, httpResponse) {
    getRequestHandler(httpRequest, httpResponse, "branch");
});

dispatcher.onGet("/complexity", function(httpRequest, httpResponse) {
    getRequestHandler(httpRequest, httpResponse, "complexity");
});

function getRequestHandler(httpRequest, httpResponse, badgeType) {
    params = url.parse(httpRequest.url, true).query;
    console.log("[INF0] Received parameters:", JSON.stringify(params));

    if(params[AUTHOR] && params[PROJECT] && params[CIRCLE_TOKEN]) {
        var latest_build_url = CIRCLE_CI_URL + "/" + params[AUTHOR] + "/" + params[PROJECT] + "/tree/master/?" + CIRCLE_TOKEN + "=" + params[CIRCLE_TOKEN] + "&limit=1&filter=successful";

        request({
            url: latest_build_url,
            json: true
        }, function(error, response, builds) {
            if(!error && response.statusCode === 200) {
                getBadge(badgeType, builds[0], function(badge) {
                    httpResponse.writeHead(200, {
                        'Content-Type': 'image/png',
                        'Cache-Control': 'no-cache',
                        'Etag': etag(badge.image),
                        'Last-Modified': new Date(Date.parse(badge.stopTime)).toUTCString()
                    });
                    httpResponse.end(badge.image, "binary");
                });
            } else {
                var badge = generateBadge({}, true);
                httpResponse.writeHead(400, {
                    'Content-Type': 'image/png',
                    'Cache-Control': 'no-cache',
                    'Etag': etag(badge)
                });
                httpResponse.end(badge, "binary");
            }
        });
    }
}

dispatcher.onGet("/report", function(httpRequest, httpResponse) {
    params = url.parse(httpRequest.url, true).query;
    console.log("[INF0] Received parameters:", JSON.stringify(params));

    if(params[AUTHOR] && params[PROJECT] && params[CIRCLE_TOKEN]) {
        var latest_build_url = CIRCLE_CI_URL + "/" + params[AUTHOR] + "/" + params[PROJECT] + "/tree/master/?" + CIRCLE_TOKEN + "=" + params[CIRCLE_TOKEN] + "&limit=1&filter=successful";

        request({
            url: latest_build_url,
            json: true
        }, function(error, response, builds) {
            if(!error && response.statusCode === 200) {
                getReport(builds[0], function(reportUrl) {
                    httpResponse.writeHead(302, {
                        'Location': reportUrl
                    });
                    httpResponse.end();
                });
            } else {
                httpResponse.end("Unable to find report: " + error + ", status-code: " + response.statusCode);
            }
        });
    }
});

function getReport(build, callback) {
    processArtifact(/html\/index\.html/, build, function(artifact) {
        callback(artifact.url);
    });
}

function getBadge(type, build, callback) {
    processArtifact(/jacocoTestReport\.xml$/, build, function(artifact) {
        request({
            url: artifact.url + "?" + CIRCLE_TOKEN + "=" + params[CIRCLE_TOKEN]
        }, function(error, response, body) {
            xml2js.parseString(body, function(err, result) {
                console.log(JSON.stringify(result.report.counter));
                var counters = {};
                result.report.counter.forEach(function(element) {
                    counters[element.$.type] = element.$;
                });

                callback({
                    image: generateBadge(type, counters, false),
                    stopTime: build.stop_time
                });
            });
        });
    });
}

function processArtifact(artifactPattern, build, callback) {
    var artifact_url = CIRCLE_CI_URL + "/" + params[AUTHOR] + "/" + params[PROJECT] + "/" + build.build_num + "/artifacts?" + CIRCLE_TOKEN + "=" + params[CIRCLE_TOKEN];
    request({
        url: artifact_url,
        json: true
    }, function(error, response, artifacts) {
        if(!error && response.statusCode === 200) {
            artifacts.forEach(function(artifact) {
                if(artifactPattern.test(artifact.path)) {
                    callback(artifact);
                }
            });
        }
    });
}

function generateBadge(type, counters, error) {
    type = (type === "line") ? "INSTRUCTION" : (type === "branch") ? "BRANCH" : (type === "complexity") ? "COMPLEXITY": "INSTRUCTION";

    var diff = (type === "INSTRUCTION" || type == "BRANCH") ? 0 : (type === "COMPLEXITY") ? 10 : 0;
    var textX = (type === "INSTRUCTION") ? 3.5 : (type === "BRANCH") ? 10.5 : (type === "COMPLEXITY") ? 4.5 : 3.5;

    var width = 90 + diff;
    var height = 18;
    var radius = 10;

    var canvas = new Canvas(width, height);
    var context = canvas.getContext('2d');

    context.antialias = "subpixel";

    var metric = error ? "!!!" : "";
    var coverageType = "";
    var color = error ? "red" : "green";
    if(!error) {
        if(type === "INSTRUCTION" || type === "BRANCH") {
            coverageType = (type === "INSTRUCTION") ? "coverage" : "branch";
            var covered = parseInt(counters[type].covered, 10);
            var missed = parseInt(counters[type].missed, 10);

            metric = Math.round((covered / (covered + missed)) * 100) + "%";

            if(metric >= 70 && metric < 85) {
                color = "orange";
            } else if(metric >= 60 && metric < 70) {
                color = "darkorange";
            } else if (metric < 60) {
                color = "darkred";
            }
        } else if(type === "COMPLEXITY") {
            coverageType = "complexity";
            var totalComplexity = parseInt(counters[type].missed, 10) + parseInt(counters[type].covered, 10);
            metric = (totalComplexity / parseInt(counters.METHOD.covered, 10));
            if(metric < 10) {
                metric = metric.toFixed(2);
            } else if(metric >= 10 && metric < 100) {
                metric = metric.toFixed(1);
            } else {
                metric = metric.toFixed(0);
            }

            if(metric > 10 && metric <= 20) {
                color = "orange";
            } else if(metric > 20 && metric <= 40) {
                color = "darkorange";
            } else if(metric > 40) {
                color = "red";
            }
        }
    }

    context.beginPath();
    context.strokeStyle = "#555555";
    context.fillStyle = "#555555";

    context.lineJoin = "round";
    context.lineWidth = radius;

    context.strokeRect(radius / 2, radius / 2, (width - 30 - diff) - radius, height - radius);
    context.fillRect(radius / 2, radius / 2, (width - 30 - diff) - radius, height - radius);

    context.lineJoin = "miter";
    context.moveTo(50 + diff + (radius / 2), 0);
    context.lineTo(50 + diff + (radius / 2), height);
    context.stroke();
    context.moveTo(50 + diff, 0);
    context.lineTo(50 + diff, height);
    context.stroke();
    context.closePath();

    context.beginPath();
    context.lineJoin = "round";
    context.strokeStyle = color;
    context.fillStyle = color;

    context.strokeRect(60 + diff + (radius / 2), radius/2, width - radius - (60 + diff), height - radius);
    context.fillRect(60 + diff + (radius / 2), radius / 2, width - radius - (60 + diff), height - radius);

    context.lineJoin = "miter";
    context.moveTo(60 + diff + (radius / 2), 0);
    context.lineTo(60 + diff + (radius / 2), height);
    context.stroke();
    context.closePath();

    context.strokeStyle = "#eeeeee";
    context.fillStyle = "#eeeeee";
    context.lineWidth = 1;
    context.lineJoin = "miter";

    context.font = "600 7.5pt sans-serif";
    context.fillText(coverageType, textX, 12);

    if(!error) {
        context.font = "600 7.5pt sans-serif";
        context.fillText(metric, 62 + ((10 - diff) / 10) + diff, 12.5);
    } else {
        context.font = "bold 7.5pt sans-serif";
        context.fillText("??%", 62 + ((10 - diff) / 10) + diff, 12.5);
    }

    return canvas.toBuffer();
}

var server = http.createServer(handleRequest);

server.listen(PORT, function(){
    console.log("Server listening on port", PORT);
});
