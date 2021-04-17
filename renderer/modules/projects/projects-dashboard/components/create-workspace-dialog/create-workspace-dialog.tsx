import {
  DialogTitle,
  DialogContent,
  DialogActions,
} from '../../../../shared/components/dialog';
import Dialog from '@material-ui/core/Dialog';
import { FormControl, Button, TextField } from '@material-ui/core';
import { ChangeEvent } from 'react';

interface ConfirmDialogProps {
  newWorkspaceName: WorkspaceName;
  onNameChange: (value: ChangeEvent) => void;
  openDialog: boolean;
  onClose: (value: boolean) => void;
}

interface WorkspaceName {
  value: string;
  valid?: boolean;
  error?: string;
  touched?: boolean;
}

export default function CreateWorkspaceDialog(
  props: ConfirmDialogProps
): JSX.Element {
  return (
    <Dialog
      disableBackdropClick
      disableEscapeKeyDown
      maxWidth="xs"
      fullWidth={true}
      open={props.openDialog}
    >
      <DialogTitle id="confirmation-dialog-title">
        Add New Workspace
      </DialogTitle>
      <DialogContent dividers>
        <form noValidate autoComplete="off">
          <FormControl>
            <TextField
              id="workspace-name"
              value={props.newWorkspaceName.value}
              label="Workspace name"
              type="search"
              variant="outlined"
              onChange={props.onNameChange}
            />
          </FormControl>
          {props.newWorkspaceName.error && props.newWorkspaceName.touched ? (
            <div style={{ color: '#E01600' }}>
              {props.newWorkspaceName.error}
            </div>
          ) : null}
        </form>
      </DialogContent>
      <DialogActions>
        <Button
          color="secondary"
          variant="outlined"
          onClick={() => props.onClose(false)}
        >
          Cancel
        </Button>
        <Button
          color="secondary"
          variant="outlined"
          autoFocus
          disabled={!props.newWorkspaceName.valid}
          onClick={() => props.onClose(true)}
        >
          Ok
        </Button>
      </DialogActions>
    </Dialog>
  );
}
