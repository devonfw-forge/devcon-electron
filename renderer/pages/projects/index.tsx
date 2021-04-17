import { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/router';
import { StepperContext } from '../../modules/projects/redux/stepper/stepperContext';
import {
  ProjectDetails,
  SearchForm,
} from '../../modules/projects/redux/stepper/data.model';
import Layout from '../../modules/shared/hoc/Layout';
import SpaceAround from '../../modules/shared/hoc/SpaceAround';
import DashboardProjects from '../../modules/projects/projects-dashboard/components/dashboard-project-details/DashboardProjects';
import ProjectsPagination, {
  PAGINATION_MIN_ROWS,
} from '../../modules/projects/projects-dashboard/components/pagination/pagination';
import { ProjectFilterBuilder } from '../../modules/projects/projects-dashboard/components/dashboard-filter/project-filter-builder';
import Paginator from '../../modules/shared/classes/paginator';
import Box from '@material-ui/core/Box';
import { WorkspaceService } from '../../modules/projects/services/workspace.service';

export default function Projects(): JSX.Element {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectDetails[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectDetails[]>([]);
  const [page, setPage] = useState<ProjectDetails[]>([]);
  const [paginator] = useState(
    new Paginator<ProjectDetails>([], PAGINATION_MIN_ROWS)
  );
  const [workspaceDir, setWorkspaceDir] = useState<string[]>([]);
  const { state, dispatch } = useContext(StepperContext);
  const workspaceService = new WorkspaceService(setWorkspaceDir);

  useEffect(() => {
    if (state.creatingProject) {
      router.push('/projects/creation');
      return;
    }

    if (!state.projectData.path) {
      dispatch({ type: 'ACCESSIBILITY' });
    }

    global.ipcRenderer.on('ide:projects', ideProjectsHandler);
    global.ipcRenderer.on('wsCreation:', getUpdatedWorkspaces);
    getUpdatedWorkspaces();
    return () => {
      global.ipcRenderer.removeAllListeners('ide:projects');
      workspaceService.closeListener();
    };
  }, []);

  useEffect(() => {
    if (state.projectData.path) {
      global.ipcRenderer.send('ide:projects', state.projectData.path);
      getUpdatedWorkspaces();
    }
  }, [state]);

  const getUpdatedWorkspaces = () => {
    // const workspaceService = new WorkspaceService(setWorkspaceDir);
    workspaceService.getProjectsInWorkspace(state.projectData.path);
  };

  const ideProjectsHandler = (
    _: unknown,
    data: { projects: ProjectDetails[] }
  ) => {
    filterProjects({ searchValue: '', filterValue: '' }, data.projects);
    setAllProjects(data.projects);
    setProjects(data.projects);
    paginator.setItems(data.projects);
    setPage(paginator.getItemsInPage());
  };

  const filterProjects = (
    searchForm: SearchForm,
    projects: ProjectDetails[]
  ): void => {
    const filtered = new ProjectFilterBuilder(projects).applyFilter(searchForm);
    setProjects(filtered);
    paginator.setItems(filtered);
    setPage(paginator.getItemsInPage());
  };

  const handleItemsPerPageChange = (nItems: number): void => {
    paginator.setItemsPerPage(nItems);
  };

  const handlePageChange = (page: number): void => {
    paginator.changePage(page);
    setPage(paginator.getItemsInPage());
  };

  return (
    <Layout>
      <SpaceAround bgcolor={'#F4F6F8'}>
        <DashboardProjects
          allProjects={allProjects}
          projects={page}
          setProject={filterProjects}
          setAllProject={setAllProjects}
          dirPath={state.projectData.path}
          projectsCount={projects.length}
          workspaces={workspaceDir}
        />
        <Box mt="auto">
          <ProjectsPagination
            count={projects.length}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleItemsPerPageChange}
          />
        </Box>
      </SpaceAround>
    </Layout>
  );
}
