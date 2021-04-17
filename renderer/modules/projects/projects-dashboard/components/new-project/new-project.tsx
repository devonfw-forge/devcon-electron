import Card from '@material-ui/core/Card';
import CardMedia from '@material-ui/core/CardMedia';
import CardContent from '@material-ui/core/CardContent';
import Typography from '@material-ui/core/Typography';
import useNewProjectStyles from './new-project.styles';
import Box from '@material-ui/core/Box';

interface NewProjectProps {
  buttonText: string;
  buttonAction?: () => void;
}

export default function NewProject(props: NewProjectProps): JSX.Element {
  const classes = useNewProjectStyles();

  return (
    <Card onClick={props.buttonAction}>
      <CardMedia
        className={classes.cardMedia}
        image="/static/assets/add_new_project.png"
        title={props.buttonText}
      />
      <CardContent className={classes.cardContent}>
        <Typography component="span">
          <Box fontWeight="fontWeightBold" fontSize={14}>
            {props.buttonText}
          </Box>
        </Typography>
      </CardContent>
    </Card>
  );
}
