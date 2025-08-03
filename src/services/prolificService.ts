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
  CreateParticipantGroupRequest,
  ParticipantGroup,
  BatchStatus,
  BatchSetupRequest,
  StudyFilter,
  ProlificFiltersResponse,
  ProlificFilterDefinition,
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

  async setupAndWaitForBatch(batchId: string, datasetId: string, tasksPerGroup: number = 1): Promise<void> {
    console.log(`Setting up batch ${batchId} with dataset ${datasetId} and ${tasksPerGroup} tasks per group...`);
    
    // Step 1: Setup the batch (this starts the processing)
    await this.setupBatch(batchId, datasetId, tasksPerGroup);
    
    // Step 2: Wait for batch to become ready
    await this.waitForBatchReady(batchId);
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

  async setupBatch(batchId: string, datasetId: string, tasksPerGroup: number = 1): Promise<void> {
    const setupData: BatchSetupRequest = {
      dataset_id: datasetId,
      tasks_per_group: tasksPerGroup,
    };
    
    const response = await this.makeRequest(`/data-collection/batches/${batchId}/setup`, {
      method: "POST",
      body: JSON.stringify(setupData),
    });
    
    // Batch setup might return empty response (204 No Content), which is fine
    console.log(`Batch ${batchId} setup initiated successfully`);
  }

  private async getBatchStatus(batchId: string): Promise<BatchStatus> {
    return this.makeRequest(`/data-collection/batches/${batchId}/status`);
  }

  private async waitForBatchReady(batchId: string, maxAttempts: number = 30, intervalMs: number = 2000): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const statusResponse = await this.getBatchStatus(batchId);
      
      if (statusResponse.status === "READY") {
        console.log(`Batch ${batchId} is ready`);
        return;
      }
      
      if (statusResponse.status === "ERROR") {
        throw new Error(`Batch ${batchId} failed to process`);
      }
      
      console.log(`Batch ${batchId} status: ${statusResponse.status}, waiting...`);
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Batch ${batchId} did not become ready within ${maxAttempts * intervalMs / 1000} seconds`);
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

  async createParticipantGroup(participantGroupData: CreateParticipantGroupRequest): Promise<ParticipantGroup> {
    return this.makeRequest("/participant-groups/", {
      method: "POST",
      body: JSON.stringify(participantGroupData),
    });
  }

  async getParticipantGroup(groupId: string): Promise<ParticipantGroup> {
    return this.makeRequest(`/participant-groups/${groupId}/`);
  }

  async getAllParticipantGroups(workspaceId?: string): Promise<ParticipantGroup[]> {
    try {
      const wsId = workspaceId || process.env.PROLIFIC_WORKSPACE_ID;
      if (!wsId) {
        throw new Error('workspace_id is required for getting participant groups');
      }
      
      const response = await this.makeRequest(`/participant-groups/?workspace_id=${wsId}`);
      return response.results || [];
    } catch (error) {
      console.error('Error getting participant groups:', error);
      throw error;
    }
  }

  async deleteParticipantGroup(groupId: string): Promise<void> {
    await this.makeRequest(`/participant-groups/${groupId}/`, {
      method: "DELETE",
    });
  }

  async ensureInternalParticipantGroupExists(): Promise<ParticipantGroup | null> {
    const internalParticipants = process.env.INTERNAL_PARTICIPANTS;
    
    if (!internalParticipants) {
      return null;
    }

    const participantIds = internalParticipants.split(',').map(id => id.trim()).filter(id => id.length > 0);
    
    if (participantIds.length === 0) {
      console.warn('INTERNAL_PARTICIPANTS is set but contains no valid participant IDs');
      return null;
    }

    // Get workspace ID from environment
    const workspaceId = process.env.PROLIFIC_WORKSPACE_ID;
    if (!workspaceId) {
      console.error('PROLIFIC_WORKSPACE_ID is required to create participant groups');
      return null;
    }

    const groupName = 'Internal Testing Group';
    
    // Check if group already exists
    try {
      const existingGroups = await this.getAllParticipantGroups(workspaceId);
      const existingGroup = existingGroups.find(group => group.name === groupName);
      
      if (existingGroup) {
        console.log(`Using existing internal participant group: ${groupName} (${existingGroup.id})`);
        return existingGroup;
      }
      
      console.log(`No existing participant group found with name: ${groupName}`);
    } catch (error) {
      console.error('Error checking for existing participant groups:', error);
    }

    // Create new group
    try {
      console.log(`Creating internal participant group with ${participantIds.length} participants in workspace ${workspaceId}`);
      const newGroup = await this.createParticipantGroup({
        workspace_id: workspaceId,
        name: groupName,
        description: `Internal testing group for babel-bot translations with participants: ${participantIds.join(', ')}`,
        participant_ids: participantIds
      });
      
      console.log(`Created internal participant group: ${groupName} (${newGroup.id})`);
      return newGroup;
    } catch (error) {
      console.error('Error creating internal participant group:', error);
      throw error;
    }
  }

  async getInternalParticipantGroupIds(): Promise<string[]> {
    if (!process.env.INTERNAL_PARTICIPANTS) {
      return [];
    }

    try {
      const internalGroup = await this.ensureInternalParticipantGroupExists();
      return internalGroup ? [internalGroup.id] : [];
    } catch (error) {
      console.error('Error getting internal participant group IDs:', error);
      return [];
    }
  }

  async getParticipantGroupFilters(): Promise<StudyFilter[]> {
    const participantGroupIds = await this.getInternalParticipantGroupIds();
    
    if (participantGroupIds.length === 0) {
      return [];
    }

    return [{
      filter_id: "participant_group_allowlist",
      selected_values: participantGroupIds
    }];
  }

  async getAllFilters(): Promise<ProlificFilterDefinition[]> {
    try {
      const response: ProlificFiltersResponse = await this.makeRequest("/filters/");
      return response.results || [];
    } catch (error) {
      console.error('Error getting Prolific filters:', error);
      throw error;
    }
  }

  async getLanguageFilters(targetLanguages: string[]): Promise<StudyFilter[]> {
    try {
      console.log(`Fetching language filters for: ${targetLanguages.join(', ')}`);
      const allFilters = await this.getAllFilters();
      console.log(`Found ${allFilters.length} total filters available`);
      
      const languageFilters: StudyFilter[] = [];

      // Map common language codes to Prolific filter patterns
      const languageMapping: { [key: string]: string[] } = {
        'es': ['spanish', 'es', 'esp'],
        'fr': ['french', 'fr', 'fra'],
        'de': ['german', 'de', 'deu'],
        'it': ['italian', 'it', 'ita'],
        'pt': ['portuguese', 'pt', 'por'],
        'nl': ['dutch', 'nl', 'nld'],
        'pl': ['polish', 'pl', 'pol'],
        'ru': ['russian', 'ru', 'rus'],
        'ja': ['japanese', 'ja', 'jpn'],
        'ko': ['korean', 'ko', 'kor'],
        'zh': ['chinese', 'zh', 'mandarin', 'chn'],
        'ar': ['arabic', 'ar', 'ara'],
        'hi': ['hindi', 'hi', 'hin'],
      };

      for (const targetLanguage of targetLanguages) {
        const langCode = targetLanguage.toLowerCase();
        const searchTerms = languageMapping[langCode] || [langCode];
        console.log(`Searching for language filters for ${targetLanguage} using terms: ${searchTerms.join(', ')}`);

        // Find matching language filters with precise matching
        const matchingFilters = allFilters.filter(filter => {
          const filterId = filter.filter_id.toLowerCase();
          const title = filter.title.toLowerCase();
          const tags = filter.tags.map(tag => tag.toLowerCase());
          
          return searchTerms.some(term => {
            // For filter_id, require exact match or word boundary match to avoid false positives
            const filterIdMatches = filterId === term || 
                                  filterId.startsWith(term + '-') || 
                                  filterId.startsWith(term + '_') ||
                                  filterId.endsWith('-' + term) ||
                                  filterId.endsWith('_' + term);
            
            // For title, require word boundary match
            const titleMatches = title === term ||
                               title.startsWith(term + ' ') ||
                               title.endsWith(' ' + term) ||
                               title.includes(' ' + term + ' ');
            
            // For tags, require exact match
            const tagMatches = tags.includes(term);
            
            // For choices, require word boundary match
            const choiceMatches = filter.choices && Object.values(filter.choices).some(choice => {
              const choiceLower = choice.toLowerCase();
              return choiceLower === term ||
                     choiceLower.startsWith(term + ' ') ||
                     choiceLower.endsWith(' ' + term) ||
                     choiceLower.includes(' ' + term + ' ');
            });
            
            return filterIdMatches || titleMatches || tagMatches || choiceMatches;
          });
        });

        if (matchingFilters.length > 0) {
          console.log(`Found ${matchingFilters.length} potential language filters for ${targetLanguage}:`);
          matchingFilters.forEach(f => console.log(`  - ${f.filter_id} (${f.title}) - Category: ${f.category}, Type: ${f.type}`));

          // Priority 1: Domain Expert filters
          const domainExpertFilter = matchingFilters.find(filter => 
            filter.category === "Domain Experts" && 
            filter.subcategory === "Language"
          );

          if (domainExpertFilter) {
            console.log(`Using domain expert filter: ${domainExpertFilter.filter_id}`);
            
            if (domainExpertFilter.choices) {
              const selectedValues = Object.keys(domainExpertFilter.choices);
              languageFilters.push({
                filter_id: domainExpertFilter.filter_id,
                selected_values: selectedValues
              });
              
              console.log(`Added domain expert filter for ${targetLanguage}: ${domainExpertFilter.filter_id} with values: ${selectedValues.join(', ')}`);
            } else {
              console.warn(`Domain expert filter ${domainExpertFilter.filter_id} has no choices available`);
            }
          } else {
            // Priority 2: Test score filters (fallback)
            const testScoreFilter = matchingFilters.find(filter => 
              filter.type === "range" && 
              (filter.data_type === "float" || filter.data_type === "integer") &&
              (filter.filter_id.includes('test') || filter.filter_id.includes('score'))
            );

            if (testScoreFilter) {
              console.log(`Using test score filter: ${testScoreFilter.filter_id} (min: ${testScoreFilter.min}, max: ${testScoreFilter.max})`);
              
              // For test scores, we want high performers (90+)
              const minScore = Math.max(90, testScoreFilter.min || 0);
              const maxScore = testScoreFilter.max || 100;
              
              // Range filters use selected_range with lower/upper
              languageFilters.push({
                filter_id: testScoreFilter.filter_id,
                selected_range: {
                  lower: minScore,
                  upper: maxScore
                }
              });
              
              console.log(`Added test score filter for ${targetLanguage}: ${testScoreFilter.filter_id} with range: ${minScore}-${maxScore}`);
            } else {
              // Priority 3: General language fluency filters (existing logic)
              const generalFilter = matchingFilters.find(filter => filter.choices);
              
              if (generalFilter) {
                console.log(`Using general language filter: ${generalFilter.filter_id}`);
                console.log(`Filter choices available: ${JSON.stringify(generalFilter.choices)}`);
                
                // Look for fluency levels - prefer "fluent", "native", or "advanced"
                const fluencyKeys = Object.keys(generalFilter.choices!).filter(key => {
                  const value = generalFilter.choices![key].toLowerCase();
                  return value.includes('fluent') || 
                         value.includes('native') || 
                         value.includes('advanced') ||
                         value.includes('professional');
                });
                
                console.log(`High fluency keys found: ${fluencyKeys.join(', ')}`);
                
                // If no specific fluency levels found, use all available options
                const selectedValues = fluencyKeys.length > 0 ? fluencyKeys : Object.keys(generalFilter.choices!);
                
                if (selectedValues.length > 0) {
                  languageFilters.push({
                    filter_id: generalFilter.filter_id,
                    selected_values: selectedValues
                  });
                  
                  console.log(`Added general language filter for ${targetLanguage}: ${generalFilter.filter_id} with values: ${selectedValues.join(', ')}`);
                } else {
                  console.warn(`No valid choices found for general language filter: ${generalFilter.filter_id}`);
                }
              } else {
                console.warn(`No usable language filters found for ${targetLanguage}`);
              }
            }
          }
        } else {
          console.warn(`No language filters found for ${targetLanguage}. Available filter IDs: ${allFilters.slice(0, 5).map(f => f.filter_id).join(', ')}... (showing first 5)`);
        }
      }

      console.log(`Final language filters: ${languageFilters.length} filters created`);
      return languageFilters;
    } catch (error) {
      console.error('Error getting language filters:', error);
      return [];
    }
  }

  async getStudyFilters(targetLanguages: string[]): Promise<StudyFilter[]> {
    const filters: StudyFilter[] = [];
    
    // Add participant group filters if configured
    const participantGroupFilters = await this.getParticipantGroupFilters();
    filters.push(...participantGroupFilters);
    
    // Add language fluency filters
    const languageFilters = await this.getLanguageFilters(targetLanguages);
    filters.push(...languageFilters);
    
    return filters;
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

    // Handle empty responses (like batch setup which might return 204 No Content)
    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type');
    
    if (contentLength === '0' || response.status === 204) {
      return null;
    }
    
    if (contentType && !contentType.includes('application/json')) {
      return await response.text();
    }

    const text = await response.text();
    if (!text.trim()) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse JSON response:', text);
      throw new Error(`Invalid JSON response from ${endpoint}: ${text}`);
    }
  }
}
