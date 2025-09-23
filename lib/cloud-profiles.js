'use strict';

var colors = require('colors/safe');
var http = require('https');
const utils = require('./utils');
const agents = require('./agents');

function getRootProjectFeatures(server, auth, callback) {
  http.get({
    host: server.replace(/https?:\/\//, ''),
    path: '/app/rest/projects/id:_Root/projectFeatures',
    headers: {
      'accept': 'application/json',
      "Authorization" : auth
    }
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          console.log(colors.gray("VERBOSE: Server returned status code " + response.statusCode));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 4."));
          process.exit(4);
      }
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
          var parsed = JSON.parse(body);
          callback(parsed);
      });
  }).end();
}

function getCloudProfile(response, cloudProfileName) {
  var features = response.projectFeature;
  var returnFeature;
  features.forEach(function(feature) {
    if (feature.type === 'CloudProfile') {
      if (utils.getFeatureProperty(feature, 'name') == cloudProfileName) {
        returnFeature = feature;
      }
    }
  });
  if (returnFeature)
    return returnFeature;
  console.log(colors.red("ERROR: Unable to find Cloud Profile '" + cloudProfileName + "'. Exiting with code 6."));
  process.exit(6);
}

function getCloudImage(cloudProfile, agentPrefix, response) {
  var cloudProfileId = cloudProfile.id;
  var features = response.projectFeature;
  var returnFeature;
  var agentPrefixProperty = utils.getFeatureProperty(cloudProfile, 'cloud-code') === 'amazon' ? 'image-name-prefix' : 'source-id';
  features.forEach(function(feature) {
    if (feature.type === 'CloudImage') {
      if (utils.getFeatureProperty(feature, 'profileId') === cloudProfileId) {
        if (utils.getFeatureProperty(feature, agentPrefixProperty) === agentPrefix) {
          returnFeature = feature;
        }
      }
    }
  });
  if (returnFeature)
    return returnFeature;
  console.log(colors.red("ERROR: Unable to find Cloud Image with profileid '" + cloudProfileId + "' and " + agentPrefixProperty + " '" + agentPrefix + "'.  Exiting with code 7."));
  process.exit(7);
}

function updateCloudImageOnTeamCity(server, auth, cloudProfile, cloudImage, currentImage, newImage, cloudProfileName, agentPrefix, dryrun, callback) {
  if (dryrun) {
    console.log(colors.cyan("INFO: TeamCity cloud profile '" + cloudProfileName + "', image '" + agentPrefix + "' is currently set to use '" + currentImage + "'. Would update to use '" + newImage + "'."));
    callback(cloudProfile.id);
    return;
  } else {
    console.log(colors.cyan("INFO: TeamCity cloud profile '" + cloudProfileName + "', image '" + agentPrefix + "' is currently set to use '" + currentImage + "'. Updating to use '" + newImage + "'."));
  }

  var host = server.replace(/https?:\/\//, '')
  var cloudCode = utils.getFeatureProperty(cloudProfile, 'cloud-code')
  var agentPrefixProperty = cloudCode === 'amazon' ? 'image-name-prefix' : 'source-id';
  var imageProperty = cloudCode === 'amazon' ? 'amazon-id' : 'imageId';
  var path = '/app/rest/projects/id:_Root/projectFeatures/type:CloudImage,property(name:' + agentPrefixProperty + ',value:' + agentPrefix + ')/properties/' + imageProperty;
  var req = http.request({
    host: host,
    path: path,
    method: 'PUT',
    headers: {
      'Authorization': auth,
      'Content-type': 'text/plain',
      'Origin': server
    }
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          console.log(colors.gray("VERBOSE: Server returned status code " + response.statusCode));
          console.log(colors.cyan("INFO: Successfully updated cloudImage " + cloudImage.id + " in teamcity."));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 8."));
          process.exit(8);
      }
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
        console.log(colors.gray("VERBOSE: " + body));
        callback(cloudProfile.id);
      });
  });

  req.on('error', function (e) {
    console.log(colors.red(e));
    console.log(colors.red("ERROR: Got error when updating cloudImage. Exiting with exit code 9."));
    process.exit(9);
  });

  req.on('timeout', function () {
    req.abort();
    console.log(colors.red("ERROR: Got timeout when updating cloudImage. Exiting with exit code 10."));
    process.exit(10);
  });

  req.write(newImage);

  req.end();
}

function tweakImageName(cloudProfile, cloudImage, newImage) {
  if (utils.getFeatureProperty(cloudProfile, 'cloud-code') !== 'arm')
    return newImage;
  //azure teamcity plugin mangles the resource id by capitalising the resource group name
  //see https://github.com/JetBrains/teamcity-azure-agent/issues/129
  var groupId = utils.getFeatureProperty(cloudImage, 'groupId');
  return newImage.replace(groupId, groupId.toUpperCase())
}

function updateCloudImage(server, auth, cloudProfileName, agentPrefix, image, dryrun) {
  getRootProjectFeatures(server, auth, function (features) {
    var cloudProfile = getCloudProfile(features, cloudProfileName);
    var cloudImage = getCloudImage(cloudProfile, agentPrefix, features);
    var imageProperty = utils.getFeatureProperty(cloudProfile, 'cloud-code') === 'amazon' ? 'amazon-id' : 'imageId';

    var currentImage = utils.getFeatureProperty(cloudImage, imageProperty);
    var newImage = tweakImageName(cloudProfile, cloudImage, image);
    if (currentImage == newImage) {
      console.log(colors.cyan("INFO: TeamCity cloud profile '" + cloudProfileName + "', image '" + agentPrefix + "' is already set to use '" + newImage + "'"));
    } else {
        utils.setFeatureProperty(cloudImage, imageProperty, newImage);
        updateCloudImageOnTeamCity(server, auth, cloudProfile, cloudImage, currentImage, newImage, cloudProfileName, agentPrefix, dryrun, function(cloudProfileId) {
          agents.disableOldAgents(server, auth, currentImage, newImage, dryrun, cloudProfileId);
        });
    }
  });
}

module.exports = {
  getRootProjectFeatures,
  getCloudProfile,
  getCloudImage,
  updateCloudImageOnTeamCity,
  tweakImageName,
  updateCloudImage
};