import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock dependencies. Under native ESM, mocks must be registered with
// unstable_mockModule before the module under test is dynamically imported.
const https = {
  get: jest.fn(),
  request: jest.fn()
};
jest.unstable_mockModule('https', () => ({ default: https }));

jest.unstable_mockModule('colors/safe.js', () => ({
  default: {
    cyan: jest.fn(str => str),
    red: jest.fn(str => str),
    yellow: jest.fn(str => str),
    gray: jest.fn(str => str)
  }
}));

jest.unstable_mockModule('./utils.js', () => ({
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

jest.unstable_mockModule('./agents.js', () => ({
  disableOldAgents: jest.fn()
}));

const cloudProfiles = await import('./cloud-profiles.js');

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

  describe('buildNewCloudImageFeature', () => {
    it('clones the template properties and sets the new prefix and image for arm', () => {
      const cloudProfile = {
        properties: {
          property: [
            { name: 'cloud-code', value: 'arm' }
          ]
        }
      };
      const templateCloudImage = {
        id: 'ci-1',
        properties: {
          property: [
            { name: 'source-id', value: 'ubu22-arm-tc2026' },
            { name: 'imageId', value: 'old-image-resource-id' },
            { name: 'groupId', value: 'myresourcegroup' }
          ]
        }
      };

      const result = cloudProfiles.buildNewCloudImageFeature(cloudProfile, templateCloudImage, 'ubu22-arm-tc2026-v383', 'new-image-resource-id');

      expect(result.type).toBe('CloudImage');
      expect(result.id).toBeUndefined();
      expect(result.properties.property.find(p => p.name === 'source-id').value).toBe('ubu22-arm-tc2026-v383');
      expect(result.properties.property.find(p => p.name === 'imageId').value).toBe('new-image-resource-id');
      expect(result.properties.property.find(p => p.name === 'groupId').value).toBe('myresourcegroup');
      // must not mutate the template it was cloned from
      expect(templateCloudImage.properties.property.find(p => p.name === 'source-id').value).toBe('ubu22-arm-tc2026');
    });

    it('clones the template properties and sets the new prefix and image for amazon', () => {
      const cloudProfile = {
        properties: {
          property: [
            { name: 'cloud-code', value: 'amazon' }
          ]
        }
      };
      const templateCloudImage = {
        id: 'ci-1',
        properties: {
          property: [
            { name: 'image-name-prefix', value: 'Ubuntu' },
            { name: 'amazon-id', value: 'ami-old' }
          ]
        }
      };

      const result = cloudProfiles.buildNewCloudImageFeature(cloudProfile, templateCloudImage, 'Ubuntu-v383', 'ami-new');

      expect(result.properties.property.find(p => p.name === 'image-name-prefix').value).toBe('Ubuntu-v383');
      expect(result.properties.property.find(p => p.name === 'amazon-id').value).toBe('ami-new');
    });
  });

  describe('createCloudImageOnTeamCity', () => {
    it('should POST the new CloudImage feature to projectFeatures', (done) => {
      const cloudProfile = { id: 'cp-1' };
      const payload = { type: 'CloudImage', properties: { property: [] } };

      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.write = jest.fn();

      https.request.mockImplementation((options, callback) => {
        expect(options.method).toBe('POST');
        expect(options.path).toBe('/app/rest/projects/id:_Root/projectFeatures');
        expect(options.headers['Content-type']).toBe('application/json');

        callback(mockResponse);

        setTimeout(() => {
          mockResponse.emit('data', '{}');
          mockResponse.emit('end');
        }, 0);

        return mockRequest;
      });

      const callback = jest.fn((cloudProfileId) => {
        expect(cloudProfileId).toBe('cp-1');
        expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify(payload));
        done();
      });

      cloudProfiles.createCloudImageOnTeamCity('https://teamcity.example.com', 'Bearer token123', cloudProfile, 'ubu22-arm-tc2026-v383', 'new-image', 'Azure Agents', payload, false, callback);
    });

    it('should not make a request and should call back immediately on dryrun', () => {
      const cloudProfile = { id: 'cp-1' };
      const payload = { type: 'CloudImage', properties: { property: [] } };

      const callback = jest.fn();

      cloudProfiles.createCloudImageOnTeamCity('https://teamcity.example.com', 'Bearer token123', cloudProfile, 'ubu22-arm-tc2026-v383', 'new-image', 'Azure Agents', payload, true, callback);

      expect(https.request).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith('cp-1');
    });

    it('should exit with error code on non-2xx status', () => {
      const cloudProfile = { id: 'cp-1' };
      const payload = { type: 'CloudImage', properties: { property: [] } };

      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 500;

      const mockRequest = new EventEmitter();
      mockRequest.end = jest.fn();
      mockRequest.write = jest.fn();

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        expect(process.exit).toHaveBeenCalledWith(13);
        return mockRequest;
      });

      cloudProfiles.createCloudImageOnTeamCity('https://teamcity.example.com', 'Bearer token123', cloudProfile, 'ubu22-arm-tc2026-v383', 'new-image', 'Azure Agents', payload, false, jest.fn());
    });
  });

  describe('createCloudImage', () => {
    it('should create a new cloud image from the template and disable agents on the old image', (done) => {
      const response = {
        projectFeature: [
          {
            type: 'CloudProfile',
            id: 'cp-1',
            properties: {
              property: [
                { name: 'name', value: 'Azure Agents' },
                { name: 'cloud-code', value: 'arm' }
              ]
            }
          },
          {
            type: 'CloudImage',
            id: 'ci-1',
            properties: {
              property: [
                { name: 'profileId', value: 'cp-1' },
                { name: 'source-id', value: 'ubu22-arm-tc2026' },
                { name: 'imageId', value: 'old-image' },
                { name: 'groupId', value: 'myresourcegroup' }
              ]
            }
          }
        ]
      };

      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;
      const mockGetRequest = new EventEmitter();
      mockGetRequest.end = jest.fn();

      https.get.mockImplementation((options, callback) => {
        callback(mockResponse);
        setTimeout(() => {
          mockResponse.emit('data', JSON.stringify(response));
          mockResponse.emit('end');
        }, 0);
        return mockGetRequest;
      });

      const mockPostResponse = new EventEmitter();
      mockPostResponse.statusCode = 200;
      const mockPostRequest = new EventEmitter();
      mockPostRequest.end = jest.fn();
      mockPostRequest.write = jest.fn();

      https.request.mockImplementation((options, callback) => {
        callback(mockPostResponse);
        setTimeout(() => {
          mockPostResponse.emit('data', '{}');
          mockPostResponse.emit('end');
        }, 0);
        return mockPostRequest;
      });

      import('./agents.js').then(({ disableOldAgents }) => {
        cloudProfiles.createCloudImage('https://teamcity.example.com', 'Bearer token123', 'Azure Agents', 'ubu22-arm-tc2026', 'ubu22-arm-tc2026-v383', '/subscriptions/abc/resourceGroups/myresourcegroup/providers/Microsoft.Compute/images/new-image', false);

        setTimeout(() => {
          const writtenPayload = JSON.parse(mockPostRequest.write.mock.calls[0][0]);
          expect(writtenPayload.properties.property.find(p => p.name === 'source-id').value).toBe('ubu22-arm-tc2026-v383');
          expect(writtenPayload.properties.property.find(p => p.name === 'imageId').value).toBe('/subscriptions/abc/resourceGroups/MYRESOURCEGROUP/providers/Microsoft.Compute/images/new-image');

          expect(disableOldAgents).toHaveBeenCalledWith(
            'https://teamcity.example.com',
            'Bearer token123',
            'old-image',
            '/subscriptions/abc/resourceGroups/MYRESOURCEGROUP/providers/Microsoft.Compute/images/new-image',
            false,
            'cp-1'
          );
          done();
        }, 10);
      });
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