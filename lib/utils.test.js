const utils = require('./utils');

describe('Utility Functions', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    process.exit.mockRestore();
  });

  describe('shortenImage', () => {
    it('should return the last segment of an image path', () => {
      expect(utils.shortenImage('path/to/my/image')).toBe('image');
      expect(utils.shortenImage('ami-12345678')).toBe('ami-12345678');
      expect(utils.shortenImage('/subscriptions/abc/resourceGroups/rg/providers/Microsoft.Compute/images/my-image')).toBe('my-image');
    });
  });

  describe('getAgentProperty', () => {
    it('should return the value of a property if it exists', () => {
      const agent = {
        properties: {
          property: [
            { name: 'system.ec2.ami-id', value: 'ami-123456' },
            { name: 'system.cloud.profile_id', value: 'cloud-1' }
          ]
        }
      };

      expect(utils.getAgentProperty(agent, 'system.ec2.ami-id')).toBe('ami-123456');
      expect(utils.getAgentProperty(agent, 'system.cloud.profile_id')).toBe('cloud-1');
    });

    it('should return null if property does not exist', () => {
      const agent = {
        properties: {
          property: [
            { name: 'system.ec2.ami-id', value: 'ami-123456' }
          ]
        }
      };

      expect(utils.getAgentProperty(agent, 'non-existent')).toBeNull();
    });
  });

  describe('getFeatureProperty', () => {
    it('should return the value of a property if it exists', () => {
      const feature = {
        properties: {
          property: [
            { name: 'name', value: 'My Cloud Profile' },
            { name: 'cloud-code', value: 'amazon' }
          ]
        }
      };

      expect(utils.getFeatureProperty(feature, 'name')).toBe('My Cloud Profile');
      expect(utils.getFeatureProperty(feature, 'cloud-code')).toBe('amazon');
    });

    it('should exit with error code if property does not exist', () => {
      const feature = {
        properties: {
          property: []
        }
      };

      utils.getFeatureProperty(feature, 'non-existent');
      expect(process.exit).toHaveBeenCalledWith(5);
    });
  });

  describe('setFeatureProperty', () => {
    it('should update the value of an existing property', () => {
      const feature = {
        properties: {
          property: [
            { name: 'imageId', value: 'old-image' },
            { name: 'other', value: 'value' }
          ]
        }
      };

      utils.setFeatureProperty(feature, 'imageId', 'new-image');
      expect(feature.properties.property[0].value).toBe('new-image');
      expect(feature.properties.property[1].value).toBe('value');
    });
  });
});