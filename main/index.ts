// Native
import { join } from 'path';
import { format } from 'url';
import { IpcMainEvent } from 'electron';
import { spawn, StdioOptions, SpawnOptions } from 'child_process';

// Packages
import { BrowserWindow, app, ipcMain, shell } from 'electron';
import isDev from 'electron-is-dev';
import prepareNext from 'electron-next';

// Other dependencies
import { TerminalService } from './services/terminal/terminal.service';
import { DevonInstancesService } from './services/devon-instances/devon-instances.service';
import { DevonfwConfig, IdeDistribution } from './models/devonfw-dists.model';
import { ProfileSetupService } from './services/profile-setup/profile-setup.service';
import { readdirPromise } from './modules/shared/utils/promised';
import { InstallListener } from './modules/projects/classes/listeners/install-listener';
import { SpawnTerminalFactory } from './modules/projects/classes/terminal/spawn-terminal-factory';
import { ProjectCreationListener } from './modules/projects/classes/listeners/project-creation-listener';
import {
  getBase64Img,
  setDashboardProfile,
  checkProfileStatus,
  getDashboardProfile,
} from './modules/profile-setup/handle-profile-setup';
import { ProjectDetails } from './models/project-details.model';
import { projectDate } from './modules/shared/utils/project-date';
import { ProjectDeleteListener } from './modules/projects/classes/listeners/project-delete-listener';
import { OpenProjectIDEListener } from './modules/projects/classes/listeners/open-project-ide-listener';
import { UserProfile } from './modules/shared/models/user-profile';
import { DevonIdeProjectsListener } from './modules/projects/classes/listeners/devon-ide-projects';

let mainWindow;
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

  try {
    const profileExists = await new ProfileSetupService().checkProfile();
    const startPage = profileExists ? 'home' : 'intro';
    const url = isDev
      ? 'http://localhost:8000/' + startPage
      : format({
          pathname: join(__dirname, '../../renderer/' + startPage + '.html'),
          protocol: 'file:',
          slashes: true,
        });

    mainWindow.loadURL(url);
  } catch (error) {
    const url = isDev
      ? 'http://localhost:8000/intro'
      : format({
          pathname: join(__dirname, '../../renderer/intro.html'),
          protocol: 'file:',
          slashes: true,
        });

    mainWindow.loadURL(url);
  }

  mainWindow.webContents.session.on('will-download', downloadHandler);
});

// Quit the app once all windows are closed
app.on('window-all-closed', async () => {
  const profileExists = await new ProfileSetupService().checkProfile();
  if (!profileExists) {
    await new ProfileSetupService().createDefaultProfile();
  }
  app.quit();
});

/* Manage all downloads */
const downloadHandler = (_, item) => {
  item.on('updated', (_, state) => {
    if (state === 'interrupted') {
      item.cancel();
    } else if (state === 'progressing') {
      if (!item.isPaused()) {
        mainWindow.webContents.send('download progress', {
          total: item.getTotalBytes(),
          received: item.getReceivedBytes(),
        });
      }
    }
  });
  item.once('done', (_, state) => {
    mainWindow.webContents.send('download completed', state);
    if (state === 'completed') {
      shell.showItemInFolder(item.getSavePath());
    }
  });
};

// Get all devon-ide-scripts from maven repository
function getDevonIdeScripts() {
  new DevonInstancesService()
    .getDevonIdeScriptsFromMaven()
    .then((instances) => {
      mainWindow.webContents.send('get:devonIdeScripts', instances);
    })
    .catch(() => {
      mainWindow.webContents.send('get:devonIdeScripts', []);
    });
}

// Finding out Devonfw Ide Instances
function countInstance() {
  new DevonInstancesService()
    .getAvailableDevonIdeInstances()
    .then((instances) => {
      mainWindow.webContents.send('count:instances', { total: instances });
    })
    .catch((error) => {
      console.log(error);
      mainWindow.webContents.send('count:instances', { total: 0 });
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

export function findOutWorkspaceLocation(paths: string[]): string[] {
  const workspaces = [];
  let location = '';
  for (const path of paths) {
    if (path.includes('workspaces')) {
      location = path.substring(
        path.lastIndexOf('workspaces') + 10,
        -path.length
      );
      if (!workspaces.includes(location)) {
        workspaces.push(location);
      }
    } else {
      location = path + '\\workspaces';
      if (!workspaces.includes(location)) {
        workspaces.push(location);
      }
    }
  }
  return workspaces;
}

function getWorkspaceProject(workspacelocation: string) {
  readdirPromise(workspacelocation)
    .then((projects: string[]) => {
      mainWindow.webContents.send('get:workspaceProjects', projects);
    })
    .catch(() => {
      mainWindow.webContents.send('get:workspaceProjects', []);
    });
}

function getProjectDetails() {
  new DevonInstancesService().readFile().then((details) => {
    mainWindow.webContents.send('get:projectDetails', details);
  });
}

/* Enable services */

/**
 * @deprecated. You should use listeners inside
 * modules/projects/listeners/ or create a new one
 */
/* terminal powershell */
const eventHandler = (
  event: IpcMainEvent,
  projectDetails: ProjectDetails,
  ...eventArgs: string[]
) => {
  const command = eventArgs[0];
  const cwd = eventArgs[1];
  let isError = false;
  if (!command) event.sender.send('terminal/powershell', '');

  const stdioOptions: StdioOptions = ['pipe', 'pipe', 'pipe'];

  let options: SpawnOptions = { stdio: stdioOptions };
  options = cwd ? { ...options, cwd } : options;
  const terminal = spawn(`powershell.exe`, [], options);

  terminal.stdout.on('data', (data) => {
    isError = false;
    console.log('sending data: ' + data.toString());
  });
  terminal.stderr.on('data', (data) => {
    console.error(data.toString());
    isError = true;
  });

  terminal.on('close', () => {
    console.log('closed stream');
    if (!isError) {
      event.sender.send('terminal/powershell', 'success');
      saveProjectDetails(projectDetails);
    } else {
      event.sender.send('terminal/powershell', 'error');
    }
  });

  terminal.stdin.write(command + '\n');
  terminal.stdin.end();
};

const saveProjectDetails = (projectDetails: ProjectDetails): void => {
  if (projectDetails) {
    projectDetails.date = projectDate();
    new DevonInstancesService().saveProjectDetails(projectDetails);
  }
};

const installEventListener = new InstallListener(new SpawnTerminalFactory());
installEventListener.listen();

const projectListener = new ProjectCreationListener(
  new SpawnTerminalFactory(),
  new DevonInstancesService()
);
projectListener.listen();

// Deleting a project process
new ProjectDeleteListener(new DevonInstancesService()).listen();

// Open a project in IDE process
new OpenProjectIDEListener(new DevonInstancesService()).listen();

new DevonIdeProjectsListener(new DevonInstancesService()).listen();

/* Installation powershell */
const installEventHandler = (event: IpcMainEvent, ...eventArgs: string[]) => {
  const cwd = eventArgs[1];
  let isError = false;

  let options: SpawnOptions = { stdio: 'pipe', shell: true };
  options = cwd ? { ...options, cwd } : options;
  const terminal = spawn(`powershell.exe`, [], options);

  terminal.stdout.on('data', (data) => {
    isError = false;
    console.log('sending data: ' + data.toString());
    event.sender.send('powershell/installation/packages', data.toString());
  });
  terminal.stderr.on('data', (data) => {
    console.error(data.toString());
    isError = true;
  });

  terminal.on('exit', (code) => {
    console.log('exit code ->', code);
  });
  terminal.on('close', () => {
    console.log('closed stream');
    if (!isError) {
      event.sender.send('powershell/installation/packages', 'success');
    } else {
      event.sender.send('powershell/installation/packages', 'error');
    }
  });

  terminal.stdin.write('npm install' + '\n');
  terminal.stdin.end();
};

const openProjectDirectory = (path: string) => {
  shell.showItemInFolder(path);
};

/* terminal service */
const terminalService = new TerminalService();
terminalService.openDialog(['openDirectory'], []);
terminalService.allCommands(null, null);
ipcMain.on('terminal/powershell', eventHandler);
ipcMain.on('powershell/installation/packages', installEventHandler);

// Finding out Devonfw Ide
ipcMain.on('find:devonfw', countInstance);
ipcMain.on('find:devonfwInstances', getDevonInstancesPath);
ipcMain.on('find:workspaceProjects', (e, option) => {
  getWorkspaceProject(option);
});
ipcMain.on('find:projectDetails', getProjectDetails);
ipcMain.on('fetch:devonIdeScripts', getDevonIdeScripts);
ipcMain.on('open:projectDirectory', (e, path) => {
  openProjectDirectory(path);
});
ipcMain.on('set:base64Img', (e, arg) => getBase64Img(arg, mainWindow));
ipcMain.on('set:profile', (e, profile: UserProfile) =>
  setDashboardProfile(profile, mainWindow)
);
ipcMain.on('find:profileStatus', () => checkProfileStatus(mainWindow));
ipcMain.on('find:profile', () => getDashboardProfile(mainWindow));
