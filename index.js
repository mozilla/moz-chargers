var cheerio = require('cheerio');
var express = require('express');
var http = require('http');
var request = require('request');

var status = {};
var statusCount;

var app = express();
app.set('port', (process.env.PORT || 8000));
app.use(express.static(__dirname + '/static'));
var server = http.createServer(app);

app.get('/', function(req, res) {
  res.redirect('/index.html');
});

app.get('/status', function (req, res) {
  res.json(status);
});

setInterval(updateStatus, 1000 * 60 * 5);

/**
 * callback used by fetch 
 * bind 'this' to the station identifier
 */
function statusCallback(err, req, body) {
  if (err) {
    console.error(err);
  } else {
    status[this] = parseStatus(body);
  }
  statusCount++;
  if (statusCount === 3) {
    updateSlack();
  }
}

function updateStatus(d, cb) {
  console.log('fetching updates...');
  statusCount = 0;
  fetch(0, statusCallback);
  fetch(1, statusCallback);
  fetch(2, statusCallback);
}

var chargerIDs = [
  97797,
  97645,
  113379
];

function fetch(n, cb) {
  request({
    method: 'post',
    url: 'https://na.chargepoint.com/maps/getMarkerDetails',
    headers: {
      'X-Requested-With': 'XMLHttpRequest'
    },
    formData: {
      deviceId: chargerIDs[n],
      level1: 1,
      level2: 1,
      levelDC: 1
    }
  }, cb.bind(n))
}

function createMessage() {
  var message = {};
  message.fallback = "Status of Mountain View EV Chargers (left to right)";
  message.title = "Status of Mountain View EV Chargers (from left to right looking from the building entrance)";
  message.fields = [];
  
  // Physical order of stations doesn't match object ids 
  message.fields.push({title: ':electric_plug:', value: status[2].port1, short: true});
  message.fields.push({title: ':electric_plug:', value: status[2].port2, short: true});
  message.fields.push({title: ':electric_plug:', value: status[0].port1, short: true});
  message.fields.push({title: ':electric_plug:', value: status[0].port2, short: true});
  // This is rotated 90º so ports are reversed
  message.fields.push({title: ':electric_plug:', value: status[1].port2, short: true});
  message.fields.push({title: ':electric_plug: :wheelchair:', value: status[1].port1, short: true});  
  
  // add the statuses to the fallback
  message.fields.forEach(function(field) {
    message.fallback += ' ' + field.value;
  });
  return message;
}

/**
  Post to slack endpoint the status of the chargers
 */
function updateSlack() {
  
  // only update if we have a defined endpoint
  if (typeof process.env.ENDPOINT === 'undefined') {
    return;
  }
  
  request({
    method: 'post',
    url: process.env.ENDPOINT,
    headers: {
      'Content-Type': "application/json"
    },
    body: JSON.stringify(createMessage())
  }, function() { console.log('posted to slack');});
  
}

function parseStatus(body) {
  var obj = {};
  var $ = cheerio.load(body);
  var rows;
  
  rows = $('div').html().split('<br>');
  rows = rows.map(function (r) {
    return cheerio.load(r);
  });
  rows = rows.filter(function ($) {
    return $('strong').text().indexOf('Port') > -1;
  });
  rows.forEach(function ($) {
    var parts = $('strong');
    var slug = parts.eq(0).text().replace(/[^\w]/g, '').toLowerCase();
    var val = $('strong i').text().toLowerCase();
    obj[slug] = val;
  });
  return obj;
}

updateStatus();

server.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'));
});
