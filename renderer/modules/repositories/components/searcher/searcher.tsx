import { Styles } from '../../../shared/types/types';
import { withSearcherStyles } from './searcher.styles';
import { Component, ChangeEvent } from 'react';
import TextField from '@material-ui/core/TextField';
import RepositoryCard from '../repository-card/RepositoryCard';
import GithubService from '../../services/github/github.service';
import Repository from '../../services/github/models/repository.model';
import LinkOpenerService from '../../../shared/services/link-opener/link-opener.service';
import SearchCard from '../search-card/search-card';
import Spinner from '../../../shared/components/spinner/spinner';
import { Box } from '@material-ui/core';

const DELAY_TIME = 1000;
interface SearcherState {
  query?: string;
  loading?: boolean;
  repositories?: Repository[];
}

interface SearcherProps {
  classes: Styles;
}

export class Searcher extends Component<SearcherProps, SearcherState> {
  timeout: NodeJS.Timeout;
  githubService: GithubService;
  linkOpener: LinkOpenerService;
  state = { loading: false, query: '', repositories: [] };

  constructor(props: SearcherProps) {
    super(props);
    this.githubService = new GithubService();
    this.linkOpener = new LinkOpenerService();
  }

  componentDidMount(): void {
    this.getRepositories();
  }

  componentDidUpdate(_: unknown, prevState: SearcherState): void {
    const queryUpdated = this.state.query !== prevState.query;
    if (queryUpdated) {
      if (this.timeout) clearTimeout(this.timeout);
      this.timeout = setTimeout(this.getRepositories, DELAY_TIME);
    }
  }

  getRepositories = (): void => {
    this.setState({ loading: true });
    this.githubService
      .getRepos(this.state.query)
      .then((repositories) => this.setState({ repositories, loading: false }));
  };

  handleQuery = (event: ChangeEvent<{ value: string }>): void => {
    const query: string = event.target.value;
    this.setState({ query });
  };

  handleOpen = (url: string): (() => void) => {
    return () => this.linkOpener.openLink(url);
  };

  handleCopy = (url: string): (() => void) => {
    return () => navigator.clipboard.writeText(url);
  };

  render(): JSX.Element {
    return (
      <>
        <SearchCard>
          <form
            className={this.props.classes.root}
            noValidate
            autoComplete="off"
          >
            <TextField
              label="Search your repository"
              variant="outlined"
              value={this.state.query}
              onChange={this.handleQuery}
            />
          </form>
        </SearchCard>
        <Box display="flex" flexDirection="column" alignItems="center">
          {this.state.loading ? (
            <Spinner inProgress />
          ) : (
            this.state.repositories.map((repository: Repository) => (
              <RepositoryCard
                {...repository}
                onOpen={this.handleOpen(repository.url)}
                onCopy={this.handleCopy(repository.url)}
                key={repository.url}
              />
            ))
          )}
        </Box>
      </>
    );
  }
}

export default withSearcherStyles(Searcher);
