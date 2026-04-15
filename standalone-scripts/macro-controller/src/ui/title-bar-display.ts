import { loopCreditState, state } from '../shared-state';
import { getDisplayProjectName } from '../logging';

export interface TitleBarDisplayState {
  text: string;
  title: string;
  color: string;
  opacity: string;
}

export function getCurrentWorkspaceDisplayName(): string {
  return state.workspaceName
    || (loopCreditState.currentWs ? (loopCreditState.currentWs.fullName || loopCreditState.currentWs.name) : '');
}

export function getTitleBarDisplayState(): TitleBarDisplayState {
  const projectName = getDisplayProjectName();
  const wsName = getCurrentWorkspaceDisplayName();

  if (projectName && projectName !== 'Unknown Project') {
    return {
      text: projectName,
      title: 'Project: ' + projectName + (wsName ? ' | Workspace: ' + wsName : ' (workspace not yet detected)') + ' — click to re-detect workspace',
      color: '#fbbf24',
      opacity: '1',
    };
  }

  if (wsName) {
    return {
      text: wsName,
      title: 'Workspace: ' + wsName + ' (project name not yet detected) — click to re-detect workspace',
      color: '#fbbf24',
      opacity: '0.85',
    };
  }

  return {
    text: '⟳ detecting…',
    title: 'Project name not detected — click to re-detect workspace',
    color: '#9ca3af',
    opacity: '1',
  };
}