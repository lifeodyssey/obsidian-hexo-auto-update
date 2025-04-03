// Mock of Electron API for testing purposes
export const dialog = {
  showOpenDialog: jest.fn().mockResolvedValue({
    canceled: false,
    filePaths: ['/mock/selected/path']
  })
};

export const app = {
  getPath: jest.fn().mockReturnValue('/mock/app/path')
};

export const shell = {
  openExternal: jest.fn()
};

// Add more mock exports as needed 
