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
    params = url.parse(httpRequest.url, true).query;
    console.log("[INF0] Received parameters:", JSON.stringify(params));

    if(params[AUTHOR] && params[PROJECT] && params[CIRCLE_TOKEN]) {
        var latest_build_url = CIRCLE_CI_URL + "/" + params[AUTHOR] + "/" + params[PROJECT] + "/tree/master/?" + CIRCLE_TOKEN + "=" + params[CIRCLE_TOKEN] + "&limit=1&filter=successful";

        request({
            url: latest_build_url,
            json: true
        }, function(error, response, builds) {
            if(!error && response.statusCode === 200) {
                getBadge(builds[0], function(badge) {
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
});

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

function getBadge(build, callback) {
    processArtifact(/jacocoTestReport\.xml$/, build, function(artifact) {
        request({
            url: artifact.url + "?" + CIRCLE_TOKEN + "=" + params[CIRCLE_TOKEN]
        }, function(error, response, body) {
            xml2js.parseString(body, function(err, result) {
                result.report.counter.forEach(function(element) {
                    if(element.$.type === "INSTRUCTION") {
                        callback({
                            image: generateBadge(element.$, false),
                            stopTime: build.stop_time
                        });
                    }
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
        context.font = "600 7.5pt sans-serif";
        context.fillText(percentage + "%", 62, 12.5);
    } else {
        context.font = "bold 7.5pt sans-serif";
        context.fillText("??%", 62, 12.5);
    }

    return canvas.toBuffer();
}

var server = http.createServer(handleRequest);

server.listen(PORT, function(){
    console.log("Server listening on port", PORT);
});
