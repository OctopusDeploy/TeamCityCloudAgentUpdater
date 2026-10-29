import colors from 'colors/safe.js';
import http from 'https';
import * as utils from './utils.js';
import * as agents from './agents.js';

function getRootProjectFeatures(server, auth, callback) {
  http.get({
    host: server.replace(/https?:\/\//, ''),
    path: '/app/rest/projects/id:_Root/projectFeatures',
    headers: {
      'accept': 'application/json',
      "Authorization" : auth,
      'user-agent': 'TeamCityCloudAgentUpdater/1.0'
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
      'Origin': server,
      'user-agent': 'TeamCityCloudAgentUpdater/1.0'
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

function buildNewCloudImageFeature(cloudProfile, templateCloudImage, newAgentPrefix, newImage) {
  var cloudCode = utils.getFeatureProperty(cloudProfile, 'cloud-code');
  var agentPrefixProperty = cloudCode === 'amazon' ? 'image-name-prefix' : 'source-id';
  var imageProperty = cloudCode === 'amazon' ? 'amazon-id' : 'imageId';

  var clonedProperties = JSON.parse(JSON.stringify(templateCloudImage.properties));
  var newFeature = { type: 'CloudImage', properties: clonedProperties };

  utils.setFeatureProperty(newFeature, agentPrefixProperty, newAgentPrefix);
  utils.setFeatureProperty(newFeature, imageProperty, newImage);

  return newFeature;
}

function createCloudImageOnTeamCity(server, auth, cloudProfile, newAgentPrefix, newImage, cloudProfileName, payload, dryrun, callback) {
  if (dryrun) {
    console.log(colors.cyan("INFO: Would create a new cloud image with agent prefix '" + newAgentPrefix + "' in cloud profile '" + cloudProfileName + "', using image '" + newImage + "'."));
    callback(cloudProfile.id);
    return;
  } else {
    console.log(colors.cyan("INFO: Creating a new cloud image with agent prefix '" + newAgentPrefix + "' in cloud profile '" + cloudProfileName + "', using image '" + newImage + "'."));
  }

  var host = server.replace(/https?:\/\//, '');
  var path = '/app/rest/projects/id:_Root/projectFeatures';
  var req = http.request({
    host: host,
    path: path,
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-type': 'application/json',
      'Accept': 'application/json',
      'Origin': server,
      'user-agent': 'TeamCityCloudAgentUpdater/1.0'
    }
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          console.log(colors.gray("VERBOSE: Server returned status code " + response.statusCode));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 13."));
          process.exit(13);
      }
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
        console.log(colors.gray("VERBOSE: " + body));
        console.log(colors.cyan("INFO: Successfully created new cloud image in teamcity."));
        callback(cloudProfile.id);
      });
  });

  req.on('error', function (e) {
    console.log(colors.red(e));
    console.log(colors.red("ERROR: Got error when creating cloud image. Exiting with exit code 14."));
    process.exit(14);
  });

  req.on('timeout', function () {
    req.abort();
    console.log(colors.red("ERROR: Got timeout when creating cloud image. Exiting with exit code 15."));
    process.exit(15);
  });

  req.write(JSON.stringify(payload));

  req.end();
}

// Creates a brand new CloudImage feature (cloned from an existing one identified by
// templateAgentPrefix) pointed at the new image, instead of editing the template's image
// reference in place. disableOldAgents matches agents by the image value they report, not by
// which CloudImage feature started them, so it disables agents on the old image unchanged.
function createCloudImage(server, auth, cloudProfileName, templateAgentPrefix, newAgentPrefix, image, dryrun) {
  getRootProjectFeatures(server, auth, function (features) {
    var cloudProfile = getCloudProfile(features, cloudProfileName);
    var templateCloudImage = getCloudImage(cloudProfile, templateAgentPrefix, features);
    var imageProperty = utils.getFeatureProperty(cloudProfile, 'cloud-code') === 'amazon' ? 'amazon-id' : 'imageId';

    var currentImage = utils.getFeatureProperty(templateCloudImage, imageProperty);
    var newImage = tweakImageName(cloudProfile, templateCloudImage, image);
    var payload = buildNewCloudImageFeature(cloudProfile, templateCloudImage, newAgentPrefix, newImage);

    createCloudImageOnTeamCity(server, auth, cloudProfile, newAgentPrefix, newImage, cloudProfileName, payload, dryrun, function(cloudProfileId) {
      agents.disableOldAgents(server, auth, currentImage, newImage, dryrun, cloudProfileId);
    });
  });
}

export {
  getRootProjectFeatures,
  getCloudProfile,
  getCloudImage,
  updateCloudImageOnTeamCity,
  tweakImageName,
  updateCloudImage,
  buildNewCloudImageFeature,
  createCloudImageOnTeamCity,
  createCloudImage
};
