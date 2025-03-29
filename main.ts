import { App, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf, TFile } from 'obsidian';

// Define plugin settings interface
interface ManuscriptCalendarSettings {
    manuscriptFolder: string;
    defaultPublishStage?: string;
}

// Define constants
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
                        // console.log(`File in manuscript folder changed: ${file.path}`);
                        
                        // Force Dataview to update its cache for this file
                        if (this.app.plugins.plugins.dataview && 
                            this.app.plugins.plugins.dataview.api &&
                            this.app.plugins.plugins.dataview.api.index) {
                            this.app.plugins.plugins.dataview.api.index.touch();
                        }
                        
                        // Update all instances of the calendar view
                        this.app.workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT_CALENDAR).forEach(leaf => {
                            if (leaf.view instanceof ManuscriptCalendarView) {
                                // Use the dedicated refresh method that only updates what's necessary
                                (leaf.view as ManuscriptCalendarView).refreshCalendar();
                                // console.log("Calendar refreshed due to file change");
                            }
                        });
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
        // Only re-render the calendar body portion to avoid flickering
        if (this.calendarTable) {
            this.renderCalendarBody();
        }
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
        separator.style.margin = '0.5rem 0';
        separator.style.padding = '0';
        
        // Create legend container
        const legendContainer = container.createDiv({ cls: 'legend-container' });
        
        // Create legend wrapper div
        const legendWrapper = legendContainer.createDiv({ cls: 'legend-wrapper' });
        
        // Create the calendar legend div
        const calendarLegend = legendWrapper.createDiv({ cls: 'calendar-legend' });
        
        // Create legend items using DOM methods instead of innerHTML
        const legendItems = [
            { cls: 'zero-color', label: 'ZERO', color: 'var(--color-zero)' },
            { cls: 'author-color', label: 'AUTHOR', color: 'var(--color-first)' },
            { cls: 'house-color', label: 'HOUSE', color: 'var(--color-editing)' },
            { cls: 'press-color', label: 'PRESS', color: 'var(--color-press)' }
        ];
        
        legendItems.forEach(item => {
            const legendItem = calendarLegend.createDiv({ cls: 'legend-item' });
            
            const legendSwatch = legendItem.createDiv({ cls: `legend-swatch ${item.cls}` });
            legendSwatch.style.backgroundColor = `${item.color} !important`;
            
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
        
        // Calculate the first day to display (Monday before or on the first day of month)
        const firstMonday = new Date(firstDay);
        // Adjust day to get the Monday of the week
        // In JavaScript: 0=Sunday, 1=Monday, ..., 6=Saturday
        const dayOfWeek = firstDay.getDay(); // 0-6
        // If it's Sunday (0), go back 6 days to previous Monday
        // Otherwise, go back (dayOfWeek - 1) days
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        firstMonday.setDate(firstDay.getDate() - daysToSubtract);
        
        // Get all notes with Due dates and Revision status
        let revisionMap = new Map<string, any[]>();
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
                
                // Filter for pages where Status = "Complete" AND Class = "Scene"
                const filteredByMetadata = pages.filter(page => {
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
                
                // Process the remaining of the calendar logic...
                // This would continue with the rest of the function implementation
                
                // Note: Continue implementing the rest of the renderCalendarBody method
                // following the same TypeScript patterns and DOM-safe practices
            }
        } catch (error) {
            console.error("Error processing calendar data:", error);
        }
        
        // Continue with creating calendar rows and cells...
    }
} 