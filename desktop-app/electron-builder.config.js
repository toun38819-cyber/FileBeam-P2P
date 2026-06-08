module.exports = {
  appId: 'com.filebeam.p2p',
  productName: 'FileBeam',
  directories: {
    buildResources: 'assets',
    output: 'dist/release'
  },
  files: [
    'dist/web/**/*',
    'dist/electron/**/*',
    'assets/**/*',
    'package.json'
  ],
  extraResources: [
    { from: '../local-server/dist/', to: 'server/', filter: ['filebeam-server.exe'] }
  ],
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] }
    ],
    icon: 'assets/icon.ico',
    requestedExecutionLevel: 'asInvoker'
  },
  nsis: {
    oneClick: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'FileBeam'
  },
  publish: null
};
