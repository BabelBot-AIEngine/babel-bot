import {
  CreateStudyRequest,
  Study,
  Submission,
  StudyTransitionRequest,
  CreateDatasetRequest,
  Dataset,
  CreateBatchRequest,
  Batch,
  UploadUrlResponse,
  DatasetStatus,
  CreateBatchInstructionsRequest,
  BatchInstructions,
  CreateWorkspaceRequest,
  Workspace,
  CreateProjectRequest,
  Project,
} from "../types/prolific";

export class ProlificService {
  private baseUrl: string = "https://api.prolific.com/api/v1";

  get apiKey() {
    if (!process.env.PROLIFIC_API_KEY) {
      throw new Error("PROLIFIC_API_KEY environment variable is required");
    }

    return process.env.PROLIFIC_API_KEY;
  }

  async createDataCollection(
    csvData: string,
    workspaceId: string,
    batchName: string,
    datasetName: string,
    taskDetails: { task_name: string; task_introduction: string; task_steps: string }
  ): Promise<Batch> {
    // Step 1: Create dataset
    const dataset = await this.createDataset({
      workspace_id: workspaceId,
      name: datasetName,
    });

    // Step 2: Get upload URL for CSV
    const uploadResponse = await this.getUploadUrl(dataset.id, `${datasetName}.csv`);

    // Step 3: Upload CSV data
    await this.uploadCsvData(uploadResponse.upload_url, csvData);

    // Step 3.5: Wait for dataset to be ready
    await this.waitForDatasetReady(dataset.id);

    // Step 4: Create batch
    const batch = await this.createBatch({
      workspace_id: workspaceId,
      name: batchName,
      dataset_id: dataset.id,
      task_details: taskDetails,
    });

    return batch;
  }

  private async createDataset(datasetData: CreateDatasetRequest): Promise<Dataset> {
    return this.makeRequest("/data-collection/datasets", {
      method: "POST",
      body: JSON.stringify(datasetData),
    });
  }

  private async createBatch(batchData: CreateBatchRequest): Promise<Batch> {
    return this.makeRequest("/data-collection/batches", {
      method: "POST",
      body: JSON.stringify(batchData),
    });
  }

  private async getUploadUrl(datasetId: string, filename: string): Promise<UploadUrlResponse> {
    return this.makeRequest(`/data-collection/datasets/${datasetId}/upload-url/${filename}`);
  }

  private async uploadCsvData(uploadUrl: string, csvData: string): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: csvData,
      headers: {
        "Content-Type": "text/csv",
      },
    });

    if (!response.ok) {
      throw new Error(`CSV upload failed: ${response.status} ${response.statusText}`);
    }
  }

  private async getDatasetStatus(datasetId: string): Promise<DatasetStatus> {
    return this.makeRequest(`/data-collection/datasets/${datasetId}/status`);
  }

  private async waitForDatasetReady(datasetId: string, maxAttempts: number = 30, intervalMs: number = 2000): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const statusResponse = await this.getDatasetStatus(datasetId);
      
      if (statusResponse.status === "READY") {
        return;
      }
      
      if (statusResponse.status === "ERROR") {
        throw new Error(`Dataset ${datasetId} failed to process`);
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Dataset ${datasetId} did not become ready within ${maxAttempts * intervalMs / 1000} seconds`);
  }

  async createBatchInstructions(batchId: string, instructionsData: CreateBatchInstructionsRequest): Promise<BatchInstructions> {
    return this.makeRequest(`/data-collection/batches/${batchId}/instructions`, {
      method: "POST",
      body: JSON.stringify(instructionsData),
    });
  }

  async getAllWorkspaces(): Promise<Workspace[]> {
    try {
      const response = await this.makeRequest("/workspaces");
      return response.results || [];
    } catch (error) {
      console.error('Error getting workspaces:', error);
      throw error;
    }
  }

  async getWorkspace(workspaceId: string): Promise<Workspace> {
    return this.makeRequest(`/workspaces/${workspaceId}/`);
  }

  async createWorkspace(workspaceData: CreateWorkspaceRequest): Promise<Workspace> {
    return this.makeRequest("/workspaces/", {
      method: "POST",
      body: JSON.stringify(workspaceData),
    });
  }

  async findWorkspaceByTitle(title: string): Promise<Workspace | null> {
    try {
      const workspaces = await this.getAllWorkspaces();
      return workspaces.find(workspace => workspace.title === title) || null;
    } catch (error) {
      console.error('Error finding workspace by title:', error);
      throw error;
    }
  }

  async ensureWorkspaceExists(title: string): Promise<Workspace> {
    const existingWorkspace = await this.findWorkspaceByTitle(title);
    
    if (existingWorkspace) {
      console.log(`Using existing workspace: ${title} (${existingWorkspace.id})`);
      return existingWorkspace;
    }

    console.log(`Creating new workspace: ${title}`);
    const newWorkspace = await this.createWorkspace({ title });
    console.log(`Created workspace: ${title} (${newWorkspace.id})`);
    
    return newWorkspace;
  }

  async getProjectsForWorkspace(workspaceId: string): Promise<Project[]> {
    try {
      const response = await this.makeRequest(`/workspaces/${workspaceId}/projects`);
      return response.results || [];
    } catch (error) {
      console.error('Error getting projects for workspace:', error);
      throw error;
    }
  }

  async createProject(workspaceId: string, projectData: CreateProjectRequest): Promise<Project> {
    return this.makeRequest(`/workspaces/${workspaceId}/projects/`, {
      method: "POST",
      body: JSON.stringify(projectData),
    });
  }

  async findProjectByTitle(workspaceId: string, title: string): Promise<Project | null> {
    try {
      const projects = await this.getProjectsForWorkspace(workspaceId);
      return projects.find(project => project.title === title) || null;
    } catch (error) {
      console.error('Error finding project by title:', error);
      throw error;
    }
  }

  async ensureProjectExists(workspaceId: string, title: string): Promise<Project> {
    const existingProject = await this.findProjectByTitle(workspaceId, title);
    
    if (existingProject) {
      console.log(`Using existing project: ${title} (${existingProject.id})`);
      return existingProject;
    }

    console.log(`Creating new project: ${title} in workspace ${workspaceId}`);
    const newProject = await this.createProject(workspaceId, { title });
    console.log(`Created project: ${title} (${newProject.id})`);
    
    return newProject;
  }

  async createStudy(studyData: CreateStudyRequest): Promise<Study> {
    return this.makeRequest("/studies/", {
      method: "POST",
      body: JSON.stringify(studyData),
      headers: {
        "x-confirmation-request": "true",
      },
    });
  }

  async getStudy(studyId: string): Promise<Study> {
    return this.makeRequest(`/studies/${studyId}/`);
  }

  async publishStudy(studyId: string): Promise<Study> {
    const transitionData: StudyTransitionRequest = { action: "PUBLISH" };
    return this.makeRequest(`/studies/${studyId}/transition/`, {
      method: "POST",
      body: JSON.stringify(transitionData),
    });
  }

  async getSubmissions(studyId: string): Promise<Submission[]> {
    return this.makeRequest(`/studies/${studyId}/submissions/`);
  }

  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Authorization: `Token ${this.apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Prolific API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }
}
