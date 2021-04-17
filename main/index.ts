// Native
import { join } from 'path';
import { format } from 'url';

// Packages
import { BrowserWindow, Menu, app, ipcMain, DownloadItem } from 'electron';
import isDev from 'electron-is-dev';
import prepareNext from 'electron-next';

// Other dependencies
import { TerminalService } from './services/terminal/terminal.service';
import DevonInstancesService from './services/devon-instances/devon-instances.service';
import { DevonfwConfig, IdeDistribution } from './models/devonfw-dists.model';
import { ProfileSetupService } from './services/profile-setup/profile-setup.service';
import { readdirPromise } from './modules/shared/utils/promised';
import { createDirectory } from './modules/shared/utils/create-directory';
import { InstallListener } from './modules/projects/classes/listeners/install-listener';
import { ProjectCreationListener } from './modules/projects/classes/listeners/project-creation-listener';
import {
  getBase64Img,
  setDashboardProfile,
  checkProfileStatus,
} from './modules/profile-setup/handle-profile-setup';
import { checkForDevonUpdates } from './modules/devon-updates/handle-devon-updates';
import { ProjectDeleteListener } from './modules/projects/classes/listeners/project-delete-listener';
import { OpenProjectIDEListener } from './modules/projects/classes/listeners/open-project-ide-listener';
import { UserProfile } from './modules/shared/models/user-profile';
import { DevonIdeProjectsListener } from './modules/projects/classes/listeners/devon-ide-projects';
import RepositoriesListener from './modules/repositories/repositories-listener';
import IDEsInstallationStatus from './modules/settings/installed-versions/services/ides-installation-status.service';
import DevonfwIdesService from './modules/settings/installed-versions/services/devonfw-ides.service';
import ChangelogListener from './modules/settings/installed-versions/services/listeners/changelog.listener';
import DownloadListener from './modules/shared/services/download-listener';
import InstallIdeListener from './modules/shared/services/install-ide-listener';
import LicenseListener from './modules/shared/services/license-listener';
import UpdateIdeListener from './modules/settings/installed-versions/services/listeners/update-ide.listener';
import { OpenIdeListener } from './modules/ides/listeners/open-ide-listener';

let mainWindow: BrowserWindow;
// Prepare the renderer once the app is ready
app.on('ready', async () => {
  await prepareNext('./renderer');
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      preload: join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.loadURL(await getWindowUrl());
  mainWindow.webContents.session.on('will-download', downloadHandler);
  mainWindow.webContents.on('did-fail-load', async () =>
    mainWindow.loadURL(await getWindowUrl())
  );

  Menu.setApplicationMenu(null);
});

// Quit the app once all windows are closed
app.on('window-all-closed', async () => {
  const profileExists = await new ProfileSetupService().doesProfileExist();
  if (!profileExists) {
    await new ProfileSetupService().createDefaultProfile();
  }
  app.quit();
});

async function getWindowUrl(): Promise<string> {
  const profileSetup = new ProfileSetupService();
  let startPage = 'intro';
  let url = '';

  if (await profileSetup.doesProfileExist()) {
    startPage = 'home';
  }

  if (isDev) {
    url = `http://localhost:8000/${startPage}`;
  } else {
    url = format({
      pathname: join(__dirname, '../../renderer/out', `${startPage}.html`),
      protocol: 'file:',
      slashes: true,
    });
  }

  return url;
}

const downloadHandler = (_, item: DownloadItem) => {
  new DownloadListener(item, mainWindow).listen();
};

// Get all devon-ide-scripts from maven repository
function getDevonIdeScripts() {
  const instancesService = new DevonInstancesService();
  const devonfwIdes = new DevonfwIdesService();
  new IDEsInstallationStatus(instancesService, devonfwIdes)
    .getDevonfwIDEsStatus((instances) =>
      mainWindow.webContents.send('get:devonIdeScripts', instances)
    )
    .catch(() => {
      mainWindow.webContents.send('get:devonIdeScripts', []);
    });
}

// Get all User created Instances
function getDevonInstancesPath() {
  new DevonInstancesService()
    .getAllUserCreatedDevonInstances()
    .then((instancesPath: DevonfwConfig) => {
      mainWindow.webContents.send(
        'get:devoninstances',
        instancesPath.distributions
      );
    })
    .catch((error) => {
      console.log(error);
      // If no instances are available
      const fakeInstance: IdeDistribution = {
        id: process.cwd(),
        ideConfig: {
          basepath: process.cwd(),
          commands: '',
          version: '',
          workspaces: process.cwd() + '\\workspaces',
        },
      };
      mainWindow.webContents.send('get:devoninstances', [fakeInstance]);
    });
}

function getWorkspaceProject(workspacelocation: string) {
  readdirPromise(join(workspacelocation, 'workspaces'))
    .then((projects: string[]) => {
      mainWindow.webContents.send('get:workspaceProjects', projects);
    })
    .catch(() => {
      mainWindow.webContents.send('get:workspaceProjects', []);
    });
}

async function getDirsFromPath(path: string) {
  try {
    const dirs = await readdirPromise(path);
    return dirs;
  } catch (e) {
    return [];
  }
}

async function createWorkspace(path: string) {
  try {
    const created = await createDirectory(path);
    mainWindow.webContents.send('wsCreation:', created);
    return created;
  } catch (e) {
    mainWindow.webContents.send('wsCreation:', '');
    return '';
  }
}

/* Enable services */

new OpenIdeListener().listen();

new InstallListener().listen();

new InstallIdeListener().listen();

new LicenseListener().listen();

new ProjectCreationListener(new DevonInstancesService()).listen();

new RepositoriesListener().listen();

// Deleting a project process
new ProjectDeleteListener(new DevonInstancesService()).listen();

// Open a project in IDE process
new OpenProjectIDEListener(new DevonInstancesService()).listen();

// Getting all the project depending on Devonfw IDE selector
new DevonIdeProjectsListener(new DevonInstancesService()).listen();

new ChangelogListener().listen();

new UpdateIdeListener().listen();

/* terminal service */
const terminalService = new TerminalService();
terminalService.openDialog(['openDirectory'], []);
terminalService.allCommands(null, null);

// Finding out Devonfw Ide
ipcMain.handle('count:projetcs', () =>
  new DevonInstancesService().getProjectsCount()
);
ipcMain.on('find:devonfwInstances', getDevonInstancesPath);
ipcMain.on('find:checkForUpdates', () => checkForDevonUpdates(mainWindow));
ipcMain.on('find:workspaceProjects', (e, option) => {
  getWorkspaceProject(option);
});
ipcMain.on('fetch:devonIdeScripts', getDevonIdeScripts);
ipcMain.handle('uninstall:ide', (e, path) =>
  new DevonInstancesService().uninstallIde(path)
);
ipcMain.on('open:directory', (e, path) =>
  new DevonInstancesService().openPathInSystemExplorer(path)
);
ipcMain.on('set:base64Img', (e, arg) => getBase64Img(arg, mainWindow));
ipcMain.on('set:profile', (e, profile: UserProfile) =>
  setDashboardProfile(profile, mainWindow)
);
ipcMain.on('find:profileStatus', () => checkProfileStatus(mainWindow));
ipcMain.handle('find:profile', () => new ProfileSetupService().getProfile());
ipcMain.handle('get:dirsFromPath', (e, path) => getDirsFromPath(path));
ipcMain.handle('create:workspace', (e, path) => createWorkspace(path));
