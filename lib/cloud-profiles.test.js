const https = require('https');
const { EventEmitter } = require('events');
const cloudProfiles = require('./cloud-profiles');

// Mock dependencies
jest.mock('colors/safe', () => ({
  cyan: jest.fn(str => str),
  red: jest.fn(str => str),
  yellow: jest.fn(str => str),
  gray: jest.fn(str => str)
}));

jest.mock('https');

jest.mock('./utils', () => ({
  getFeatureProperty: jest.fn((feature, prop) => {
    const property = feature.properties?.property?.find(p => p.name === prop);
    if (!property) {
      console.log(`ERROR: Unable to find property '${prop}'`);
      process.exit(5);
    }
    return property.value;
  }),
  setFeatureProperty: jest.fn((feature, prop, value) => {
    const property = feature.properties?.property?.find(p => p.name === prop);
    if (property) {
      property.value = value;
    }
  })
}));

jest.mock('./agents', () => ({
  disableOldAgents: jest.fn()
}));

describe('Cloud Profile Operations', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    process.exit.mockRestore();
  });

  describe('getCloudProfile', () => {
    it('should return cloud profile with matching name', () => {
      const response = {
        projectFeature: [
          {
            type: 'CloudProfile',
            id: 'cp-1',
            properties: {
              property: [
                { name: 'name', value: 'AWS Agents' }
              ]
            }
          },
          {
            type: 'CloudProfile',
            id: 'cp-2',
            properties: {
              property: [
                { name: 'name', value: 'Azure Agents' }
              ]
            }
          }
        ]
      };

      const result = cloudProfiles.getCloudProfile(response, 'AWS Agents');
      expect(result.id).toBe('cp-1');
    });

    it('should exit with error code if cloud profile not found', () => {
      const response = {
        projectFeature: []
      };

      cloudProfiles.getCloudProfile(response, 'Non-existent');
      expect(process.exit).toHaveBeenCalledWith(6);
    });
  });

  describe('getCloudImage', () => {
    it('should return cloud image for AWS with matching prefix', () => {
      const cloudProfile = {
        id: 'cp-1',
        properties: {
          property: [
            { name: 'cloud-code', value: 'amazon' }
          ]
        }
      };

      const response = {
        projectFeature: [
          {
            type: 'CloudImage',
            id: 'ci-1',
            properties: {
              property: [
                { name: 'profileId', value: 'cp-1' },
                { name: 'image-name-prefix', value: 'Ubuntu' }
              ]
            }
          }
        ]
      };

      const result = cloudProfiles.getCloudImage(cloudProfile, 'Ubuntu', response);
      expect(result.id).toBe('ci-1');
    });

    it('should return cloud image for Azure with matching source-id', () => {
      const cloudProfile = {
        id: 'cp-1',
        properties: {
          property: [
            { name: 'cloud-code', value: 'arm' }
          ]
        }
      };

      const response = {
        projectFeature: [
          {
            type: 'CloudImage',
            id: 'ci-1',
            properties: {
              property: [
                { name: 'profileId', value: 'cp-1' },
                { name: 'source-id', value: 'Ubuntu' }
              ]
            }
          }
        ]
      };

      const result = cloudProfiles.getCloudImage(cloudProfile, 'Ubuntu', response);
      expect(result.id).toBe('ci-1');
    });

    it('should exit with error code if cloud image not found', () => {
      const cloudProfile = {
        id: 'cp-1',
        properties: {
          property: [
            { name: 'cloud-code', value: 'amazon' }
          ]
        }
      };

      const response = {
        projectFeature: []
      };

      cloudProfiles.getCloudImage(cloudProfile, 'Ubuntu', response);
      expect(process.exit).toHaveBeenCalledWith(7);
    });
  });

  describe('tweakImageName', () => {
    it('should return image unchanged for non-ARM cloud profiles', () => {
      const cloudProfile = {
        properties: {
          property: [
            { name: 'cloud-code', value: 'amazon' }
          ]
        }
      };
      const cloudImage = {};

      const result = cloudProfiles.tweakImageName(cloudProfile, cloudImage, 'ami-12345');
      expect(result).toBe('ami-12345');
    });

    it('should uppercase resource group for ARM cloud profiles', () => {
      const cloudProfile = {
        properties: {
          property: [
            { name: 'cloud-code', value: 'arm' }
          ]
        }
      };
      const cloudImage = {
        properties: {
          property: [
            { name: 'groupId', value: 'myresourcegroup' }
          ]
        }
      };

      const input = '/subscriptions/abc/resourceGroups/myresourcegroup/providers/Microsoft.Compute/images/my-image';
      const expected = '/subscriptions/abc/resourceGroups/MYRESOURCEGROUP/providers/Microsoft.Compute/images/my-image';

      const result = cloudProfiles.tweakImageName(cloudProfile, cloudImage, input);
      expect(result).toBe(expected);
    });
  });

  describe('getRootProjectFeatures', () => {
    it('should fetch project features from TeamCity', (done) => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();

      https.get.mockImplementation((options, callback) => {
        expect(options.host).toBe('teamcity.example.com');
        expect(options.path).toBe('/app/rest/projects/id:_Root/projectFeatures');
        expect(options.headers.Authorization).toBe('Bearer token123');

        callback(mockResponse);

        setTimeout(() => {
          mockResponse.emit('data', JSON.stringify({ projectFeature: [{ id: 'feature-1' }] }));
          mockResponse.emit('end');
        }, 0);

        return mockRequest;
      });

      const callback = jest.fn((response) => {
        expect(response.projectFeature).toHaveLength(1);
        expect(response.projectFeature[0].id).toBe('feature-1');
        done();
      });

      cloudProfiles.getRootProjectFeatures('https://teamcity.example.com', 'Bearer token123', callback);
    });

    it('should exit on non-200 status', () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 404;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();

      https.get.mockImplementation((options, callback) => {
        callback(mockResponse);
        // The code expects the exit to happen immediately when statusCode is checked
        expect(process.exit).toHaveBeenCalledWith(4);
        return mockRequest;
      });

      cloudProfiles.getRootProjectFeatures('https://teamcity.example.com', 'Bearer token123', jest.fn());
    });
  });
});