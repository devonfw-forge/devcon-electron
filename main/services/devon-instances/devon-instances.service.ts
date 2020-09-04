import fs from 'fs';
import path from 'path';
import https from 'https';
import platform from 'os';
import {
  DevonfwConfig,
  IdeDistribution,
  DevonIdeScripts,
} from '../../models/devonfw-dists.model';
import * as util from 'util';
import * as child from 'child_process';
import {
  ProcessState,
  ProjectDetails,
} from '../../models/project-details.model';
import { SaveDetails } from './save-details';
import { exec } from 'child_process';

const utilExec = util.promisify(child.exec);
const utilReaddir = util.promisify(fs.readdir);
const rmdir = util.promisify(fs.rmdir);
const unlink = util.promisify(fs.unlink);

export class DevonInstancesService implements SaveDetails {
  private devonFilePath = path.resolve(
    platform.homedir(),
    '.devon',
    'projectinfo.json'
  );
  private idePathsFilePath = path.resolve(
    process.env.USERPROFILE,
    '.devon',
    'ide-paths'
  );

  /* Find out DEVON ide instances  */
  getAvailableDevonIdeInstances(): Promise<number> {
    const dirReader = new Promise<number>((resolve, reject) => {
      this.getAllUserCreatedDevonInstances().then(
        (instances: DevonfwConfig) => {
          this.getCreatedDevonInstancesCount(instances)
            .then((count) => {
              resolve(count);
            })
            .catch((error) => reject(error));
        }
      );
    });
    return dirReader;
  }

  /* Finding out total count of projects available in each DEVON ide instances */
  getCreatedDevonInstancesCount(instances: DevonfwConfig): Promise<number> {
    let count = 0;
    return new Promise<number>(async (resolve, reject) => {
      try {
        const projectDetails = await this.readFile();
        if (projectDetails.length) {
          for (const distribution of instances.distributions) {
            if (distribution.id) {
              count =
                count +
                projectDetails.filter((data) =>
                  data.path.includes(distribution.id)
                ).length;
            }
          }
          resolve(count);
        } else {
          resolve(0);
        }
      } catch (error) {
        console.error(error);
        reject(error);
      }
    });
  }

  /* Finding all DEVON instances created by USER */
  getAllUserCreatedDevonInstances(): Promise<DevonfwConfig> {
    const instancesDirReader = new Promise<DevonfwConfig>((resolve, reject) => {
      fs.readFile(this.idePathsFilePath, 'utf8', (err, data) => {
        if (err) reject('No instances find out');
        this.devonfwInstance(data)
          .then((instances: DevonfwConfig) => resolve(instances))
          .catch((error) => console.log(error));
      });
    });
    return instancesDirReader;
  }

  updateUserCreatedDevonInstances(data: DevonfwConfig): Promise<string> {
    return new Promise((resolve, reject) => {
      const formattedData =
        data.distributions
          .map((ide) => ide.ideConfig.basepath)
          .map((basepath) => this.formatPathFromWindows(basepath))
          .join('\n') + '\n';
      fs.writeFile(this.idePathsFilePath, formattedData, (err) => {
        if (err) reject(err);
        else resolve('Successs');
      });
    });
  }

  formatPathToWindows(dirPath: string): string {
    return dirPath.replace('/', '').replace('/', ':/').replace(/\//g, path.sep);
  }

  formatPathFromWindows(dirPath: string): string {
    return dirPath.replace('', '/').replace(':', '').replace(/\\/g, '/');
  }

  async devonfwInstance(data: string): Promise<DevonfwConfig> {
    let paths: string[] = [];
    const instances: DevonfwConfig = { distributions: [] };
    if (data) {
      paths = data.split('\n');
      for (let singlepath of paths) {
        if (singlepath) {
          if (process.platform === 'win32') {
            singlepath = this.formatPathToWindows(singlepath);
          }
          try {
            const { stdout } = await utilExec('devon -v', {
              cwd: path.resolve(singlepath, 'scripts'),
            });
            instances.distributions.push(
              this.getIdeDistribution(singlepath, stdout)
            );
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
    return instances;
  }

  getIdeDistribution(singlepath: string, stdout: string): IdeDistribution {
    return {
      id: singlepath,
      ideConfig: {
        version: stdout.trim(),
        basepath: singlepath,
        commands: path.resolve(singlepath, 'scripts', 'command'),
        workspaces: path.resolve(singlepath, 'workspaces'),
      },
    };
  }

  getDevonIdeScriptsFromMaven(): Promise<DevonIdeScripts[]> {
    let ideScripts: DevonIdeScripts[] = [];
    let data = '';
    const ideScriptsPromise = new Promise<DevonIdeScripts[]>(
      (resolve, reject) => {
        https
          .get(
            'https://search.maven.org/classic/solrsearch/select?q=g%3A%22com.devonfw.tools.ide%22%20AND%20a%3A%22devonfw-ide-scripts%22&rows=20&core=gav&wt=json',
            (res) => {
              res.on('data', (d) => {
                data += d;
              });
              res.on('end', () => {
                const jsonData = JSON.parse(data);
                ideScripts = jsonData['response']['docs'].map((i) => {
                  return { version: i.v, updated: i.timestamp };
                });
                resolve(ideScripts);
              });
            }
          )
          .on('error', (e) => {
            reject('error: ' + e);
          });
      }
    );
    return ideScriptsPromise;
  }

  getLatestDevonIdeScriptsFromMaven(): Promise<DevonIdeScripts> {
    let ideScript: DevonIdeScripts;
    let data = '';
    const ideScriptPromise = new Promise<DevonIdeScripts>((resolve, reject) => {
      https
        .get(
          'https://search.maven.org/classic/solrsearch/select?q=a%3A%22devonfw-ide-scripts%22&rows=20&wt=json',
          (res) => {
            res.on('data', (d) => {
              data += d;
            });
            res.on('end', () => {
              const jsonData = JSON.parse(data);
              const latestIdeScript = jsonData['response']['docs'][0];
              ideScript = {
                version: latestIdeScript.latestVersion,
                updated: latestIdeScript.timestamp,
              };
              resolve(ideScript);
            });
          }
        )
        .on('error', (e) => {
          reject('error: ' + e);
        });
    });
    return ideScriptPromise;
  }

  /* Checking projectinfo.json is exists?, if exits overriding data or 
    creating a json file with project details
  */
  getData(data: ProjectDetails, writeFile: (data) => void): void {
    fs.exists(this.devonFilePath, (exists: boolean) => {
      if (exists) {
        writeFile(data);
      } else {
        this.writeFile([{ ...data }], { flag: 'wx' });
      }
    });
  }

  /* Storing information of Project details */
  saveProjectDetails(data: ProjectDetails): void {
    this.getData(data, (data: ProjectDetails) => {
      this.readFile()
        .then((details: ProjectDetails[]) => {
          if (details && details.length) {
            const projectDetails = details.splice(0);
            projectDetails.push(data);
            this.writeFile(projectDetails);
          } else if (details && details.length === 0) {
            this.writeFile([data]);
          }
        })
        .catch((error) => {
          throw error;
        });
    });
  }

  /* Writing up project deatils in a JSON file */
  writeFile(data: ProjectDetails[], flag?: { flag: string }): void {
    const optional = flag ? flag : '';
    fs.writeFile(this.devonFilePath, JSON.stringify(data), optional, function (
      err
    ) {
      if (err) throw err;
    });
  }

  /* Reading out project deatils which user has created */
  readFile(): Promise<ProjectDetails[]> {
    return new Promise<ProjectDetails[]>((resolve, reject) => {
      fs.readFile(this.devonFilePath, (error, data) => {
        if (error) reject(resolve([]));
        resolve(data ? JSON.parse(data.toString()) : []);
      });
    });
  }

  async deleteProjectFolder(projectPath: string) {
    const entries = await utilReaddir(projectPath, { withFileTypes: true });
    const results = await Promise.all(
      entries.map((entry) => {
        const fullPath = path.join(projectPath, entry.name);
        const task = entry.isDirectory()
          ? this.deleteProjectFolder(fullPath)
          : unlink(fullPath);
        return task.catch((error) => ({ error }));
      })
    );
    results.forEach((result) => {
      if (result && result.error.code !== 'ENOENT') throw result.error;
    });
    await rmdir(projectPath);
  }

  async openIdeExecutionCommandForVscode(
    project: ProjectDetails,
    ide: string
  ): Promise<ProcessState> {
    try {
      return await utilExec(this.findCommand(ide), {
        cwd: project.path,
      });
    } catch (error) {
      console.error(error);
    }
  }

  openIdeExecutionCommand(
    project: ProjectDetails,
    ide: string
  ): Promise<ProcessState> {
    return new Promise<ProcessState>((resolve, reject) => {
      const terminal = exec(this.findCommand(ide), {
        cwd: project.path,
      });

      terminal.stdout.on('data', (data) => {
        resolve({
          stdout: data.toString(),
          stderr: '',
        });
      });

      terminal.stderr.on('data', (data) => {
        reject({
          stdout: '',
          stderr: data.toString(),
        });
      });

      terminal.on('close', () => {
        resolve(null);
      });
    });
  }

  findCommand(ide: string): string {
    switch (ide) {
      case 'eclipse':
        return 'devon eclipse';
      case 'vscode':
        return 'devon vscode';
    }
  }

  deleteProject(
    projectDetail: ProjectDetails,
    dirPath: string
  ): Promise<ProjectDetails[]> {
    return new Promise<ProjectDetails[]>((resolve, reject) => {
      this.deleteProjectFolder(projectDetail.path)
        .then(async () => {
          const projects = await this.readFile();
          const relatedDirProjects = projects.filter(
            (project) =>
              project.name !== projectDetail.name &&
              project.path.includes(dirPath)
          );
          const otherDirProjects = projects.filter(
            (project) => !project.path.includes(dirPath)
          );
          this.writeFile([...relatedDirProjects, ...otherDirProjects]);
          return relatedDirProjects.length
            ? resolve(relatedDirProjects)
            : resolve([]);
        })
        .catch((error) => {
          console.error(error);
          reject([]);
        });
    });
  }
}
