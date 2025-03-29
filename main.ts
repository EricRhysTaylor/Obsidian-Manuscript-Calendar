import { App, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf, TFile } from 'obsidian';

// Define plugin settings interface
interface ManuscriptCalendarSettings {
    manuscriptFolder: string;
    defaultPublishStage?: string;
}

// Define constants - Auto-copy test
const VIEW_TYPE_MANUSCRIPT_CALENDAR = 'manuscript-calendar-view';

// Define default settings
const DEFAULT_SETTINGS: ManuscriptCalendarSettings = {
    manuscriptFolder: ''
};

// Extend the App interface to include plugins
declare module 'obsidian' {
    interface App {
        plugins: {
            plugins: {
                dataview?: {
                    api: DataviewAPI;
                };
            };
        };
    }
}

// Define DataviewAPI interface for type safety
interface DataviewAPI {
    pages: (query?: string) => Promise<any[]>;
    index?: {
        touch: () => void;
    };
}

// Define Page interface for Dataview pages
interface DataviewPage {
    file: {
        path: string;
    };
    Status?: string | string[];
    Class?: string | string[];
    Due?: string | { path: string };
    Revision?: number;
    'Publish Stage'?: string;
    [key: string]: any;
}

export default class ManuscriptCalendarPlugin extends Plugin {
    settings: ManuscriptCalendarSettings;

    async onload() {
        // console.log('Loading Manuscript Calendar plugin...');
        
        try {
            await this.loadSettings();
            
            // Register the custom view
            this.registerView(
                VIEW_TYPE_MANUSCRIPT_CALENDAR,
                (leaf) => new ManuscriptCalendarView(leaf, this)
            );
            
            // Add the view to the right sidebar when the plugin is loaded
            this.addRibbonIcon('calendar-range', 'Manuscript Calendar', () => {
                this.activateView();
            });
            
            // Add command to open calendar in right sidebar
            this.addCommand({
                id: 'open-manuscript-calendar',
                name: 'Open Manuscript Calendar',
                callback: () => {
                    this.activateView();
                }
            });
            
            // Add settings tab
            this.addSettingTab(new ManuscriptCalendarSettingTab(this.app, this));
            
            // Automatically open the calendar view when Obsidian starts
            this.app.workspace.onLayoutReady(() => {
                this.activateView();
            });
            
            // Function to check if file is in manuscript folder and update calendar if needed
            const checkFileAndUpdateCalendar = (file: TFile) => {
                if (file && file.path) {
                    // Get the raw manuscript folder path
                    const manuscriptFolderPath = this.settings.manuscriptFolder;
                    
                    // Check if the file is in the manuscript folder
                    const isInManuscriptFolder = 
                        // If manuscriptFolderPath is empty/undefined/null, include all files
                        manuscriptFolderPath === undefined || 
                        manuscriptFolderPath === null || 
                        manuscriptFolderPath === "" 
                            ? true
                            // Otherwise, check if the file path includes the manuscript folder path
                            : file.path.includes(manuscriptFolderPath.replace(/^\/+|\/+$/g, ''));
                    
                    if (isInManuscriptFolder) {
                        console.log(`File in manuscript folder changed: ${file.path}`);
                        
                        // Get metadata for debugging
                        const metadata = this.app.metadataCache.getFileCache(file);
                        if (metadata && metadata.frontmatter) {
                            console.log(`Frontmatter detected:`, metadata.frontmatter);
                            
                            // Special handling for Publish Stage changes
                            if (metadata.frontmatter["Publish Stage"]) {
                                console.log(`Publish Stage changed to: ${metadata.frontmatter["Publish Stage"]}`);
                            }
                        }
                        
                        // Force Dataview to update its cache for this file with a slight delay to ensure 
                        // metadata changes are processed completely
                        setTimeout(() => {
                            if (this.app.plugins.plugins.dataview && 
                                this.app.plugins.plugins.dataview.api &&
                                this.app.plugins.plugins.dataview.api.index) {
                                this.app.plugins.plugins.dataview.api.index.touch();
                                
                                // Update all instances of the calendar view after dataview cache update
                                setTimeout(() => {
                                    this.app.workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT_CALENDAR).forEach(leaf => {
                                        if (leaf.view instanceof ManuscriptCalendarView) {
                                            // Use the dedicated refresh method that only updates what's necessary
                                            (leaf.view as ManuscriptCalendarView).refreshCalendar();
                                            console.log("Calendar refreshed due to file change");
                                        }
                                    });
                                }, 300); // Short delay to ensure dataview has completed its update
                            } else {
                                // If dataview isn't available, still update the calendar
                                this.app.workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT_CALENDAR).forEach(leaf => {
                                    if (leaf.view instanceof ManuscriptCalendarView) {
                                        (leaf.view as ManuscriptCalendarView).refreshCalendar();
                                    }
                                });
                            }
                        }, 100); // Short delay to ensure metadata is fully processed
                    }
                }
            };
            
            // Add a listener for metadata cache changes
            this.registerEvent(
                this.app.metadataCache.on('changed', checkFileAndUpdateCalendar)
            );
            
            // Also listen for file modifications
            this.registerEvent(
                this.app.vault.on('modify', checkFileAndUpdateCalendar)
            );
            
            // console.log('Manuscript Calendar plugin loaded successfully');
        } catch (error) {
            console.error('Error loading Manuscript Calendar plugin:', error);
        }
    }

    onunload() {
        // console.log('Unloading Manuscript Calendar plugin...');
        
        try {
            // Properly detach all leaves of this view type
            this.app.workspace.detachLeavesOfType(VIEW_TYPE_MANUSCRIPT_CALENDAR);
            
            // All registered events are automatically unregistered by Obsidian's Plugin system
            
            // console.log('Manuscript Calendar plugin unloaded successfully');
        } catch (error) {
            console.error('Error unloading Manuscript Calendar plugin:', error);
        }
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        // Handle case where the data file might not exist yet
        if (!loadedData) {
            this.settings = Object.assign({}, DEFAULT_SETTINGS);
        } else {
            // Ensure we don't lose empty strings during the merge
            this.settings = {
                ...DEFAULT_SETTINGS,
                ...loadedData
            };
        }
    }

    async saveSettings() {
        // Make sure we're preserving any empty string values
        await this.saveData(this.settings);
        
        // After saving settings, update all open calendar views
        this.app.workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT_CALENDAR).forEach(leaf => {
            if (leaf.view instanceof ManuscriptCalendarView) {
                (leaf.view as ManuscriptCalendarView).refreshCalendar();
            }
        });
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT_CALENDAR)[0];
        if (!leaf) {
            const newLeaf = workspace.getRightLeaf(false);
            if (newLeaf) {
                leaf = newLeaf;
                await leaf.setViewState({
                    type: VIEW_TYPE_MANUSCRIPT_CALENDAR,
                    active: true,
                });
            }
        }
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }
}

class ManuscriptCalendarSettingTab extends PluginSettingTab {
    plugin: ManuscriptCalendarPlugin;

    constructor(app: App, plugin: ManuscriptCalendarPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Manuscript Calendar Settings' });
        
        // Store the actual current value to compare later
        const currentValue = this.plugin.settings.manuscriptFolder;
        
        new Setting(containerEl)
            .setName('Manuscript Folder')
            .setDesc('The folder containing your manuscript files (leave empty to search all files)')
            .addText(text => {
                // Set the actual value directly without using || which can replace empty strings
                text
                    .setPlaceholder('path/to/manuscript')
                    .setValue(currentValue !== null && currentValue !== undefined ? currentValue : '')
                    .onChange(async (value) => {
                        // Ensure value is never null/undefined by converting to empty string
                        const newValue = value ?? '';
                        this.plugin.settings.manuscriptFolder = newValue;
                        await this.plugin.saveSettings();
                    });
            });
    }
}

class ManuscriptCalendarView extends ItemView {
    plugin: ManuscriptCalendarPlugin;
    currentDate: Date;
    calendarTable: HTMLTableElement;
    
    constructor(leaf: WorkspaceLeaf, plugin: ManuscriptCalendarPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentDate = new Date();
        
        // Add event listener for when Obsidian's layout is ready
        this.plugin.app.workspace.onLayoutReady(() => {
            // Re-render the calendar body to ensure scenes are processed
            if (this.calendarTable) {
                this.renderCalendarBody();
            }
        });
    }

    // Helper method to get the week number
    getWeekNumber(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    }

    getViewType(): string {
        return VIEW_TYPE_MANUSCRIPT_CALENDAR;
    }

    getDisplayText(): string {
        return "Manuscript Calendar";
    }

    getIcon(): string {
        return "calendar-range";
    }

    // Method to refresh the calendar data and display
    refreshCalendar(): void {
        console.log('Refreshing calendar view');
        // Force a complete redraw of the calendar to ensure all data is updated
        this.renderCalendarBody().then(() => {
            console.log('Calendar body refreshed successfully');
        }).catch(error => {
            console.error('Error refreshing calendar:', error);
        });
    }

    async onOpen(): Promise<void> {
        try {
            this.contentEl.empty();
            this.contentEl.addClass('manuscript-calendar-view');
            
            await this.renderCalendar();
        } catch (error) {
            console.error("Error opening calendar view:", error);
            this.contentEl.setText("Error loading calendar. Check console for details.");
        }
    }

    async onClose(): Promise<void> {
        // Return void instead of boolean to match the interface
        return;
    }

    async renderCalendar(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        
        // Add a visible header
        container.createEl('h3', { text: 'Manuscript Calendar' });
        
        // Create controls
        const controlsDiv = container.createDiv({ cls: 'calendar-controls' });
        
        // Month selector
        const monthSelector = controlsDiv.createDiv({ cls: 'month-selector' });
        
        // Month display - now first element
        const monthDisplay = monthSelector.createSpan();
        
        // Create a container for navigation buttons
        const navButtons = monthSelector.createDiv({ cls: 'nav-buttons' });
        
        // Add left arrow with SVG
        const prevButton = navButtons.createEl('button', { 
            cls: 'nav-button prev-month'
        });
        
        // Create SVG element properly using DOM methods
        const prevSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        prevSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        prevSvg.setAttribute('width', '16');
        prevSvg.setAttribute('height', '16');
        prevSvg.setAttribute('viewBox', '0 0 24 24');
        prevSvg.setAttribute('fill', 'none');
        prevSvg.setAttribute('stroke', 'currentColor');
        prevSvg.setAttribute('stroke-width', '2');
        prevSvg.setAttribute('stroke-linecap', 'round');
        prevSvg.setAttribute('stroke-linejoin', 'round');
        
        const prevPolyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        prevPolyline.setAttribute('points', '15 18 9 12 15 6');
        
        prevSvg.appendChild(prevPolyline);
        prevButton.appendChild(prevSvg);
        
        // Add today button between arrows
        const todayButton = navButtons.createEl('button', { 
            text: 'TODAY',
            cls: 'today-button'
        });
        
        // Add right arrow with SVG
        const nextButton = navButtons.createEl('button', { 
            cls: 'nav-button next-month'
        });
        
        // Create SVG element properly using DOM methods
        const nextSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        nextSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        nextSvg.setAttribute('width', '16');
        nextSvg.setAttribute('height', '16');
        nextSvg.setAttribute('viewBox', '0 0 24 24');
        nextSvg.setAttribute('fill', 'none');
        nextSvg.setAttribute('stroke', 'currentColor');
        nextSvg.setAttribute('stroke-width', '2');
        nextSvg.setAttribute('stroke-linecap', 'round');
        nextSvg.setAttribute('stroke-linejoin', 'round');
        
        const nextPolyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        nextPolyline.setAttribute('points', '9 18 15 12 9 6');
        
        nextSvg.appendChild(nextPolyline);
        nextButton.appendChild(nextSvg);
        
        // Update month display
        const updateMonthDisplay = () => {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            // Clear the text content
            monthDisplay.textContent = '';
            
            // Set data attributes for CSS to use
            monthDisplay.setAttribute('data-month', months[this.currentDate.getMonth()]);
            monthDisplay.setAttribute('data-year', this.currentDate.getFullYear().toString());
        };
        
        updateMonthDisplay();
        
        // Add event listeners for month navigation
        prevButton.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            updateMonthDisplay();
            this.renderCalendarBody();
        });
        
        nextButton.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            updateMonthDisplay();
            this.renderCalendarBody();
        });
        
        todayButton.addEventListener('click', () => {
            this.currentDate = new Date();
            updateMonthDisplay();
            this.renderCalendarBody();
        });
        
        // Create calendar table
        const calendarTable = container.createEl('table', { cls: 'manuscript-calendar' });
        
        // Create header row
        const headerRow = calendarTable.createEl('tr');
        const weekHeader = headerRow.createEl('th', { text: 'W', cls: 'week-number' });
        
        // Updated day labels with three letters
        const dayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        dayLabels.forEach(day => {
            headerRow.createEl('th', { text: day });
        });
        
        // Store the table for later updates
        this.calendarTable = calendarTable;
        
        // Render the calendar body
        await this.renderCalendarBody();
        
        // Add horizontal rule to separate calendar from legend
        const separator = container.createEl('hr', { cls: 'calendar-legend-separator' });
        
        // Create legend container
        const legendContainer = container.createDiv({ cls: 'legend-container' });
        
        // Create legend wrapper div
        const legendWrapper = legendContainer.createDiv({ cls: 'legend-wrapper' });
        
        // Create the calendar legend div
        const calendarLegend = legendWrapper.createDiv({ cls: 'calendar-legend' });
        
        // Create legend items using DOM methods instead of innerHTML
        const legendItems = [
            { cls: 'stage-zero', label: 'ZERO' },
            { cls: 'stage-author', label: 'AUTHOR' },
            { cls: 'stage-house', label: 'HOUSE' },
            { cls: 'stage-press', label: 'PRESS' }
        ];
        
        legendItems.forEach(item => {
            const legendItem = calendarLegend.createDiv({ cls: 'legend-item' });
            
            const legendSwatch = legendItem.createDiv({ cls: `legend-swatch ${item.cls}` });
            
            const legendLabel = legendItem.createSpan({ cls: 'legend-label', text: item.label });
        });
    }

    async renderCalendarBody() {
        // Clear existing rows except header
        const rows = this.calendarTable.querySelectorAll('tr:not(:first-child)');
        rows.forEach(row => row.remove());
        
        const today = new Date();
        const currentYear = this.currentDate.getFullYear();
        const currentMonth = this.currentDate.getMonth();
        
        // Get first day of month
        const firstDay = new Date(currentYear, currentMonth, 1);
        // Get last day of month
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        
        // Calculate the first day to display (Sunday before or on the first day of month)
        const firstDisplayDay = new Date(firstDay);
        // Adjust to previous Sunday (for calendar display)
        firstDisplayDay.setDate(firstDay.getDate() - firstDay.getDay());
        
        // Get all notes with Due dates and Revision status
        const revisionMap = new Map<string, Array<{revision: number, publishStage: string}>>();
        let notesByDate = new Map<string, DataviewPage[]>();
        let todoFutureDates = new Set<string>(); // Track future Todo dates
        let overdueDates = new Set<string>(); // Track overdue dates
        
        try {
            // Check if Dataview plugin is available
            if (this.app.plugins.plugins.dataview) {
                const dataviewApi = this.app.plugins.plugins.dataview.api;
                
                // Get folder path from settings and clean it up
                const rawFolderPath = this.plugin.settings.manuscriptFolder;
                // Use an explicit check against undefined or null, keeping empty strings as empty
                let folderPath = (rawFolderPath === undefined || rawFolderPath === null) ? "" : rawFolderPath;
                
                // Declare pages variable at the top level so it's accessible outside if/else blocks
                let pages: DataviewPage[] = [];
                
                // Only proceed with filtering if a folder path is specified - use explicit check for empty string
                if (!folderPath || folderPath.trim() === "") {
                    // If no folder path is specified, get all pages
                    try {
                        if (dataviewApi.index && typeof dataviewApi.index.touch === 'function') {
                            // Refresh the dataview cache
                            await dataviewApi.index.touch();
                        }
                        pages = await dataviewApi.pages();
                    } catch (e) {
                        console.error("Error getting all pages:", e);
                    }
                } else {
                    // Remove leading and trailing slashes and whitespace for consistency
                    folderPath = folderPath.trim().replace(/^\/+|\/+$/g, '');
                    
                    // Try different query formats to handle path variations
                    try {
                        // Force refresh of dataview cache before querying
                        if (dataviewApi.index && typeof dataviewApi.index.touch === 'function') {
                            // This forces dataview to refresh its cache for the manuscript folder
                            await dataviewApi.index.touch();
                        }
                        
                        // Try multiple query approaches in sequence
                        let querySuccess = false;
                        
                        // 1. First try with explicit folder: prefix and quotes (most reliable)
                        try {
                            pages = await dataviewApi.pages(`folder:"${folderPath}"`);
                            querySuccess = true;
                        } catch (e1) {
                            // Failed, will try next approach
                        }
                        
                        // 2. Try with just quotes if first attempt failed
                        if (!querySuccess) {
                            try {
                                pages = await dataviewApi.pages(`"${folderPath}"`);
                                querySuccess = true;
                            } catch (e2) {
                                // Failed, will try next approach
                            }
                        }
                        
                        // 3. Try without quotes as last resort
                        if (!querySuccess) {
                            try {
                                pages = await dataviewApi.pages(folderPath);
                                querySuccess = true;
                            } catch (e3) {
                                console.error("All query attempts failed for path:", folderPath);
                            }
                        }
                        
                        // If all attempts failed, fall back to getting all pages
                        if (!querySuccess) {
                            pages = await dataviewApi.pages();
                        }
                    } catch (error) {
                        console.error("Unexpected error during query attempts:", error);
                        // Fallback to getting all pages in case of catastrophic error
                        try {
                            pages = await dataviewApi.pages();
                        } catch (fallbackError) {
                            console.error("Even fallback query failed:", fallbackError);
                            pages = []; // Empty array as last resort
                        }
                    }
                }
                
                // Add this new section to process Todo scenes with future dates
                // Get all pages with Todo status
                const todoPages = pages.filter(page => {
                    // Check if Status property exists and equals "Todo"
                    const hasTodoStatus = page.Status && (
                        Array.isArray(page.Status) 
                            ? page.Status.includes("Todo") 
                            : page.Status === "Todo"
                    );
                    
                    // Check if Class property exists and equals "Scene"
                    const hasSceneClass = page.Class && (
                        Array.isArray(page.Class) 
                            ? page.Class.includes("Scene") 
                            : page.Class === "Scene"
                    );
                    
                    return hasTodoStatus && hasSceneClass;
                });
                
                // Process Todo pages to identify future dates
                todoPages.forEach(page => {
                    if (!page.Due) return;
                    
                    // Parse the Due date
                    let dueDate: Date;
                    try {
                        // Extract date from link if needed
                        let rawDate: string = typeof page.Due === 'object' && page.Due.path 
                            ? page.Due.path 
                            : page.Due as string;
                        dueDate = new Date(rawDate);
                        
                        if (isNaN(dueDate.getTime())) return;
                        
                        // Check if the due date is in the future
                        if (dueDate > today) {
                            // Add to the future Todo dates set
                            const dateKey = dueDate.toISOString().split('T')[0];
                            todoFutureDates.add(dateKey);
                            
                            // Add to notesByDate for potential clicking/opening
                            if (!notesByDate.has(dateKey)) {
                                notesByDate.set(dateKey, []);
                            }
                            const notes = notesByDate.get(dateKey);
                            if (notes) {
                                notes.push(page);
                            }
                        }
                    } catch (error) {
                        return;
                    }
                });
                
                // Find overdue items - not complete but due date is in the past
                const overduePages = pages.filter(page => {
                    // Check if Status is NOT Complete
                    const isNotComplete = page.Status && (
                        Array.isArray(page.Status) 
                            ? !page.Status.includes("Complete") 
                            : page.Status !== "Complete"
                    );
                    
                    // Check if Class property exists and equals "Scene"
                    const hasSceneClass = page.Class && (
                        Array.isArray(page.Class) 
                            ? page.Class.includes("Scene") 
                            : page.Class === "Scene"
                    );
                    
                    // Has a Due date that's in the past
                    let isDueDateInPast = false;
                    if (page.Due) {
                        try {
                            // Extract date from link if needed
                            let rawDueDate: string = typeof page.Due === 'object' && page.Due.path 
                                ? page.Due.path 
                                : page.Due as string;
                            const dueDate = new Date(rawDueDate);
                            isDueDateInPast = !isNaN(dueDate.getTime()) && dueDate < today;
                        } catch (error) {
                            isDueDateInPast = false;
                        }
                    }
                    
                    return isNotComplete && hasSceneClass && isDueDateInPast;
                });
                
                // Process overdue pages and add to overdueDates set
                overduePages.forEach(page => {
                    if (!page.Due) return;
                    
                    try {
                        // Extract date from link if needed
                        let rawDate: string = typeof page.Due === 'object' && page.Due.path 
                            ? page.Due.path 
                            : page.Due as string;
                        const dueDate = new Date(rawDate);
                        
                        if (isNaN(dueDate.getTime())) return;
                        
                        // Format date as YYYY-MM-DD
                        const dateKey = dueDate.toISOString().split('T')[0];
                        
                        // Add to overdueDates set
                        overdueDates.add(dateKey);
                        
                        // Also add to notesByDate for potential clicking/opening
                        if (!notesByDate.has(dateKey)) {
                            notesByDate.set(dateKey, []);
                        }
                        
                        const notes = notesByDate.get(dateKey);
                        if (notes) {
                            notes.push(page);
                        }
                    } catch (error) {
                        return;
                    }
                });
                
                // Filter for pages where Status = "Complete" AND Class = "Scene"
                const completedScenes = pages.filter(page => {
                    // Check if Status property exists and equals "Complete"
                    const hasCompleteStatus = page.Status && (
                        Array.isArray(page.Status) 
                            ? page.Status.includes("Complete") 
                            : page.Status === "Complete"
                    );
                    
                    // Check if Class property exists and equals "Scene"
                    const hasSceneClass = page.Class && (
                        Array.isArray(page.Class) 
                            ? page.Class.includes("Scene") 
                            : page.Class === "Scene"
                    );
                    
                    return hasCompleteStatus && hasSceneClass;
                });
                
                // Process completed scenes and organize by due date
                completedScenes.forEach(page => {
                    if (!page.Due) return;
                    
                    try {
                        // Extract date from link if needed
                        let rawDate: string = typeof page.Due === 'object' && page.Due.path 
                            ? page.Due.path 
                            : page.Due as string;
                        const dueDate = new Date(rawDate);
                        
                        if (isNaN(dueDate.getTime())) return;
                        
                        // Format date as YYYY-MM-DD
                        const dateKey = dueDate.toISOString().split('T')[0];
                        
                        // Get revision number and publish stage
                        const revision = typeof page.Revision === 'number' ? page.Revision : 0;
                        let publishStage = page["Publish Stage"] || "ZERO";
                        
                        // If it's an array, take the first value
                        if (Array.isArray(publishStage)) {
                            publishStage = publishStage[0] || "ZERO";
                        }
                        
                        // Convert legacy publish stage values to new format
                        const stageMap = {
                            "Zero": "ZERO",
                            "First": "AUTHOR",
                            "Editing": "HOUSE",
                            "Press": "PRESS"
                        };
                        
                        // If the publishStage is one of the legacy values, convert it
                        if (publishStage in stageMap) {
                            publishStage = stageMap[publishStage as keyof typeof stageMap];
                        } else {
                            // Normalize to uppercase for consistent checking
                            publishStage = publishStage.toString().toUpperCase();
                        }
                        
                        // Add to revisionMap
                        if (!revisionMap.has(dateKey)) {
                            revisionMap.set(dateKey, []);
                        }
                        
                        // Add to the array for this date
                        revisionMap.get(dateKey)?.push({
                            revision: revision,
                            publishStage: publishStage
                        });
                        
                        // Also add to notesByDate for potential clicking/opening
                        if (!notesByDate.has(dateKey)) {
                            notesByDate.set(dateKey, []);
                        }
                        
                        const notes = notesByDate.get(dateKey);
                        if (notes) {
                            notes.push(page);
                        }
                    } catch (error) {
                        console.error("Error processing scene:", error);
                    }
                });
            }
        } catch (error) {
            console.error("Error processing calendar data:", error);
        }
        
        // Create calendar grid with the collected data
        let currentDate = new Date(firstDisplayDay);
        
        // Create weeks until we've passed the end of the month
        while (currentDate <= lastDay || currentDate.getDay() !== 0) {
            // Create week row
            const weekRow = this.calendarTable.createEl('tr');
            
            // Add week number cell
            const weekNum = this.getWeekNumber(currentDate);
            const weekCell = weekRow.createEl('td', { 
                text: weekNum.toString(), 
                cls: 'week-number' 
            });
            
            // Create day cells for each day of the week
            for (let i = 0; i < 7; i++) {
                const dateKey = currentDate.toISOString().split('T')[0];
                const isCurrentMonth = currentDate.getMonth() === currentMonth;
                const isToday = currentDate.toDateString() === today.toDateString();
                
                // Create day cell with appropriate classes
                const dayCell = weekRow.createEl('td', {
                    text: currentDate.getDate().toString()
                });
                
                // Add appropriate classes based on the date
                if (!isCurrentMonth) {
                    dayCell.addClass('other-month');
                }
                
                if (isToday) {
                    dayCell.addClass('today');
                }
                
                // Check if this date has scenes
                const hasScenes = revisionMap.has(dateKey);
                const isFutureTask = todoFutureDates.has(dateKey);
                const isOverdue = overdueDates.has(dateKey);
                const isPastDate = currentDate < today && !isToday;
                
                // Make the cell clickable if it has scenes
                if (hasScenes || isFutureTask || isOverdue) {
                    dayCell.addClass('clickable-cell');
                    
                    // If it's a future task, add future-todo class
                    if (isFutureTask) {
                        dayCell.addClass('future-todo');
                    }
                    
                    // Show overdue indicator only if there are no completed scenes for this date
                    // This ensures completed scenes are shown with their proper color even if there are also overdue tasks
                    if (isOverdue && !hasScenes) {
                        // Create indicator for overdue tasks
                        const overdueDot = dayCell.createDiv({
                            cls: 'revision-dot overdue'
                        });
                    }
                    
                    // If it's a future task and not an overdue or completed scene
                    else if (isFutureTask && !hasScenes && !isOverdue) {
                        // Create indicator for future todos
                        const futureTodoDot = dayCell.createDiv({
                            cls: 'revision-dot future-todo-dot'
                        });
                    }
                    
                    // Show completed scene indicators
                    else if (hasScenes) {
                        const scenesForDate = revisionMap.get(dateKey);
                        
                        if (scenesForDate) {
                            // Track which publish stages we've seen for this date
                            const stagesForDate = new Set<string>();
                            let hasZeroRevision = false;
                            let hasNonZeroRevision = false;
                            
                            // Determine which stages are present
                            scenesForDate.forEach(scene => {
                                stagesForDate.add(scene.publishStage);
                                
                                if (scene.revision === 0) {
                                    hasZeroRevision = true;
                                } else {
                                    hasNonZeroRevision = true;
                                }
                            });

                            // Only show publish stage colors for today or future dates
                            // For past dates, they're either overdue (red) or complete (stage colors)
                            const stageChecks = [
                                { stage: "ZERO", cls: "stage-zero" },
                                { stage: "AUTHOR", cls: "stage-author" },
                                { stage: "HOUSE", cls: "stage-house" },
                                { stage: "PRESS", cls: "stage-press" }
                            ];
                            
                            // Debug log for stagesForDate
                            console.log(`Date ${dateKey} has stages:`, Array.from(stagesForDate));
                            console.log(`Stage checks:`, stageChecks);
                            
                            // Also add support for legacy values for backward compatibility
                            const stageCheckMap = {
                                "Zero": "ZERO",
                                "First": "AUTHOR",
                                "Editing": "HOUSE",
                                "Press": "PRESS"
                            };
                            
                            stageChecks.forEach(check => {
                                // Check for both the new exact match and possible legacy values
                                if (stagesForDate.has(check.stage) || 
                                    stagesForDate.has(Object.keys(stageCheckMap).find(
                                        key => stageCheckMap[key as keyof typeof stageCheckMap] === check.stage
                                    ) || "")) {
                                    // Create dot for this stage
                                    console.log(`Adding dot for stage ${check.stage}`);
                                    
                                    const revisionDot = dayCell.createDiv({
                                        cls: `revision-dot ${check.cls}`
                                    });
                                    
                                    // For Zero stage, handle special case with revision
                                    if (check.stage === "ZERO" && hasNonZeroRevision) {
                                        revisionDot.addClass('has-revision');
                                    }
                                }
                            });
                            
                            // If we have both zero and non-zero revisions for Zero stage,
                            // add a special split indicator
                            if (hasZeroRevision && hasNonZeroRevision && 
                                (stagesForDate.has("ZERO") || stagesForDate.has("Zero"))) {
                                // Replace individual indicators with a split one
                                // Find and remove any existing Zero stage indicators
                                const existingZeroDots = dayCell.querySelectorAll('.revision-dot.stage-zero');
                                existingZeroDots.forEach(dot => dot.remove());
                                
                                // Create a split indicator
                                const splitDot = dayCell.createDiv({
                                    cls: 'revision-dot split-revision'
                                });
                                
                                // Create left part (Zero revision)
                                const zeroPart = splitDot.createDiv({
                                    cls: 'revision-part stage-zero'
                                });
                                
                                // Create right part (revisions > 0)
                                const nonZeroPart = splitDot.createDiv({
                                    cls: 'revision-part has-revision-part'
                                });
                            }
                        }
                    }
                    
                    // Make cell clickable to open the scenes for this date
                    if (notesByDate.has(dateKey)) {
                        // Get notes for this date
                        const notes = notesByDate.get(dateKey);
                        
                        // Create tooltip for this cell
                        if (notes && notes.length > 0) {
                            // Find overdue and completed notes
                            const overdueNotes = notes.filter(note => {
                                const status = note.Status;
                                const isComplete = status && (
                                    Array.isArray(status) 
                                        ? status.includes("Complete") 
                                        : status === "Complete"
                                );
                                return !isComplete;
                            });
                            
                            const completedNotes = notes.filter(note => {
                                const status = note.Status;
                                const isComplete = status && (
                                    Array.isArray(status) 
                                        ? status.includes("Complete") 
                                        : status === "Complete"
                                );
                                return isComplete;
                            });
                            
                            // Add mouseover event to show tooltip
                            dayCell.addEventListener('mouseover', (event) => {
                                // Remove any existing tooltips
                                const existingTooltip = document.querySelector('.calendar-tooltip');
                                if (existingTooltip) {
                                    existingTooltip.remove();
                                }
                                
                                // Create tooltip element using DOM methods
                                const tooltip = document.createElement('div');
                                tooltip.classList.add('calendar-tooltip');
                                
                                // Show overdue notes first with red color
                                if (overdueNotes.length > 0) {
                                    const overdueSection = document.createElement('div');
                                    overdueSection.classList.add('tooltip-section', 'overdue-section');
                                    
                                    const overdueHeading = document.createElement('h4');
                                    overdueHeading.textContent = 'Overdue:';
                                    overdueSection.appendChild(overdueHeading);
                                    
                                    const overdueList = document.createElement('ul');
                                    overdueNotes.forEach(note => {
                                        const listItem = document.createElement('li');
                                        // Get filename from path and remove .md extension
                                        const filename = note.file.path.split('/').pop()?.replace(/\.md$/, '') || 'Unknown';
                                        listItem.textContent = filename;
                                        overdueList.appendChild(listItem);
                                    });
                                    
                                    overdueSection.appendChild(overdueList);
                                    tooltip.appendChild(overdueSection);
                                }
                                
                                // Show completed notes with their stage color
                                if (completedNotes.length > 0) {
                                    const completedSection = document.createElement('div');
                                    completedSection.classList.add('tooltip-section', 'completed-section');
                                    
                                    const completedHeading = document.createElement('h4');
                                    completedHeading.textContent = 'Completed:';
                                    completedSection.appendChild(completedHeading);
                                    
                                    const completedList = document.createElement('ul');
                                    completedNotes.forEach(note => {
                                        const listItem = document.createElement('li');
                                        const publishStage = note["Publish Stage"] || "ZERO";
                                        const stageClass = publishStage.toString().toUpperCase() === "ZERO" ? "stage-zero" : 
                                                          publishStage.toString().toUpperCase() === "AUTHOR" ? "stage-author" :
                                                          publishStage.toString().toUpperCase() === "HOUSE" ? "stage-house" :
                                                          publishStage.toString().toUpperCase() === "PRESS" ? "stage-press" : "";
                                        
                                        if (stageClass) {
                                            listItem.classList.add(stageClass);
                                        }
                                        
                                        // Get filename from path and remove .md extension
                                        const filename = note.file.path.split('/').pop()?.replace(/\.md$/, '') || 'Unknown';
                                        listItem.textContent = filename;
                                        completedList.appendChild(listItem);
                                    });
                                    
                                    completedSection.appendChild(completedList);
                                    tooltip.appendChild(completedSection);
                                }
                                
                                // If we have future todos but no overdue or completed notes
                                if (tooltip.childElementCount === 0 && isFutureTask) {
                                    const futureSection = document.createElement('div');
                                    futureSection.classList.add('tooltip-section', 'future-section');
                                    
                                    const futureHeading = document.createElement('h4');
                                    futureHeading.textContent = 'Future Todos:';
                                    futureSection.appendChild(futureHeading);
                                    
                                    const futureList = document.createElement('ul');
                                    notes.forEach(note => {
                                        const listItem = document.createElement('li');
                                        // Get filename from path and remove .md extension
                                        const filename = note.file.path.split('/').pop()?.replace(/\.md$/, '') || 'Unknown';
                                        listItem.textContent = filename;
                                        futureList.appendChild(listItem);
                                    });
                                    
                                    futureSection.appendChild(futureList);
                                    tooltip.appendChild(futureSection);
                                }
                                
                                // Only add the tooltip if it has content
                                if (tooltip.childElementCount > 0) {
                                    // Add tooltip to document
                                    document.body.appendChild(tooltip);
                                    
                                    // Add CSS class to position tooltip (defined in styles.css)
                                    tooltip.classList.add('tooltip-positioning');
                                    
                                    // Use the initial mouse position to update the custom properties
                                    const mouseEvent = event as MouseEvent;
                                    updateTooltipPosition(tooltip, mouseEvent);
                                }
                            });
                            
                            // Remove tooltip on mouseout
                            dayCell.addEventListener('mouseout', () => {
                                const tooltip = document.querySelector('.calendar-tooltip');
                                if (tooltip) {
                                    tooltip.remove();
                                }
                            });
                            
                            // Keep the tooltip positioned with the mouse as it moves within the cell
                            dayCell.addEventListener('mousemove', (event) => {
                                const tooltip = document.querySelector('.calendar-tooltip');
                                if (tooltip) {
                                    const mouseEvent = event as MouseEvent;
                                    updateTooltipPosition(tooltip, mouseEvent);
                                }
                            });
                            
                            // Helper function to update tooltip position via CSS variables
                            function updateTooltipPosition(tooltip: Element, event: MouseEvent) {
                                const root = document.documentElement;
                                root.style.setProperty('--tooltip-left', `${event.pageX + 10}px`);
                                root.style.setProperty('--tooltip-top', `${event.pageY + 10}px`);
                            }
                        }
                        
                        dayCell.addEventListener('click', async () => {
                            const notes = notesByDate.get(dateKey);
                            if (notes && notes.length > 0) {
                                try {
                                    // Find overdue notes and completed notes
                                    let overdueNotes: DataviewPage[] = [];
                                    let completedNotes: DataviewPage[] = [];
                                    
                                    // Categorize notes
                                    notes.forEach(note => {
                                        const status = note.Status;
                                        const isComplete = status && (
                                            Array.isArray(status) 
                                                ? status.includes("Complete") 
                                                : status === "Complete"
                                        );
                                        
                                        if (isComplete) {
                                            completedNotes.push(note);
                                        } else {
                                            overdueNotes.push(note);
                                        }
                                    });
                                    
                                    // Handle notes based on what we have
                                    if (overdueNotes.length > 0 && completedNotes.length > 0) {
                                        // We have both overdue and completed notes for this date
                                        
                                        // Get file paths
                                        const overduePath = overdueNotes[0].file.path;
                                        const completedPath = completedNotes[0].file.path;
                                        
                                        // Check which files are already open
                                        let overdueLeaf: WorkspaceLeaf | null = null;
                                        let completedLeaf: WorkspaceLeaf | null = null;
                                        
                                        this.app.workspace.iterateAllLeaves(leaf => {
                                            const viewState = leaf.getViewState();
                                            if (viewState.state?.file === overduePath) {
                                                overdueLeaf = leaf;
                                            } else if (viewState.state?.file === completedPath) {
                                                completedLeaf = leaf;
                                            }
                                        });
                                        
                                        // Open overdue note first if not already open
                                        if (!overdueLeaf) {
                                            await this.app.workspace.openLinkText(overduePath, '', true);
                                            // Get the newly opened leaf
                                            this.app.workspace.iterateAllLeaves(leaf => {
                                                const viewState = leaf.getViewState();
                                                if (viewState.state?.file === overduePath) {
                                                    overdueLeaf = leaf;
                                                    return true;
                                                }
                                            });
                                        }
                                        
                                        // Open completed note if not already open
                                        if (!completedLeaf) {
                                            await this.app.workspace.openLinkText(completedPath, '', true);
                                        }
                                        
                                        // Focus on the overdue note
                                        if (overdueLeaf) {
                                            this.app.workspace.setActiveLeaf(overdueLeaf);
                                        }
                                    } else {
                                        // Only have one type of note (either overdue or completed)
                                        let noteToOpen = overdueNotes.length > 0 ? overdueNotes[0] : completedNotes[0];
                                        const filePath = noteToOpen.file.path;
                                        
                                        // Check if file is already open
                                        let existingLeaf: WorkspaceLeaf | null = null;
                                        this.app.workspace.iterateAllLeaves(leaf => {
                                            const viewState = leaf.getViewState();
                                            if (viewState.state?.file === filePath) {
                                                existingLeaf = leaf;
                                                return true;
                                            }
                                        });
                                        
                                        if (existingLeaf) {
                                            // If file is already open, set it as active
                                            this.app.workspace.setActiveLeaf(existingLeaf);
                                        } else {
                                            // If file is not open, open it in a new tab
                                            this.app.workspace.openLinkText(filePath, '', true);
                                        }
                                    }
                                } catch (error) {
                                    console.error("Error opening file:", error);
                                }
                            }
                        });
                    }
                }
                
                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
    }
} 