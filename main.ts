import { App, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf, TFile, setIcon, TAbstractFile, MarkdownRenderer } from 'obsidian';

// Define plugin settings interface
interface ManuscriptCalendarSettings {
    manuscriptFolder: string;
    defaultPublishStage?: string;
    debugMode?: boolean;
}

// Define constants - Auto-copy test
const VIEW_TYPE_MANUSCRIPT_CALENDAR = 'manuscript-calendar-view';

// Define default settings
const DEFAULT_SETTINGS: ManuscriptCalendarSettings = {
    manuscriptFolder: '',
    debugMode: false
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

// Add this interface to track scene counts and words
interface WeekStats {
    sceneCount: number;
    wordCount: number;
}

// Add this function before the ManuscriptCalendarView class
function createRatioSVG(numerator: number, denominator: number): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 30");
    svg.classList.add("ratio-svg");

    // Create numerator text
    const numeratorText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    numeratorText.setAttribute("x", "15");
    numeratorText.setAttribute("y", "11");
    numeratorText.setAttribute("text-anchor", "middle");
    numeratorText.classList.add("ratio-numerator");
    numeratorText.textContent = numerator.toString();
    svg.appendChild(numeratorText);

    // Create angled line (10 degrees)
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    
    // Calculate coordinates for a line at 10 degree angle
    const centerX = 15;
    const centerY = 15;
    const lineLength = 14;
    const angleRad = 10 * Math.PI / 180; // 10 degrees in radians
    
    const x1 = centerX - lineLength/2 * Math.cos(angleRad);
    const y1 = centerY + lineLength/2 * Math.sin(angleRad);
    const x2 = centerX + lineLength/2 * Math.cos(angleRad);
    const y2 = centerY - lineLength/2 * Math.sin(angleRad);
    
    line.setAttribute("x1", x1.toString());
    line.setAttribute("y1", y1.toString());
    line.setAttribute("x2", x2.toString());
    line.setAttribute("y2", y2.toString());
    line.classList.add("ratio-line");
    svg.appendChild(line);

    // Create denominator text
    const denominatorText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    denominatorText.setAttribute("x", "15");
    denominatorText.setAttribute("y", "23");
    denominatorText.setAttribute("text-anchor", "middle");
    denominatorText.classList.add("ratio-denominator");
    denominatorText.textContent = denominator.toString();
    svg.appendChild(denominatorText);

    return svg;
}

export default class ManuscriptCalendarPlugin extends Plugin {
    settings: ManuscriptCalendarSettings;
    currentHighestStage: string;
    completedWeekStats: Map<string, WeekStats> = new Map();

    // Global debug log function for the plugin
    debugLog(message: string, ...optionalParams: any[]) {
        if (this.settings.debugMode) {
            console.log(`[DEBUG Plugin] ${message}`, ...optionalParams);
        }
    }

    async onload() {
        try {
            // Load settings FIRST before attempting to use them (e.g., in debugLog)
            await this.loadSettings();

            // Log loading message using the new function
            this.debugLog('Loading Manuscript Calendar plugin...');
            
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
                name: 'Open',
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
            
            // Moved checkFileAndUpdateCalendar outside onload
            
            // Add listeners using arrow functions to preserve 'this'
            this.registerEvent(
                this.app.metadataCache.on('changed', (file) => this.checkFileAndUpdateCalendar(file))
            );
            
            this.registerEvent(
                this.app.vault.on('modify', (file) => this.checkFileAndUpdateCalendar(file))
            );
            
            this.debugLog('Manuscript Calendar plugin loaded successfully');
        } catch (error) {
            console.error('Error loading Manuscript Calendar plugin:', error);
        }
    }

    // Moved checkFileAndUpdateCalendar here as a class method
    checkFileAndUpdateCalendar(abstractFile: TAbstractFile) {
        // Use proper type checking instead of casting
        if (!(abstractFile instanceof TFile)) {
            return; // Ignore folders
        }
        
        // Now we know it's a TFile, no need to cast
        if (abstractFile.path) {
            const manuscriptFolderPath = this.settings.manuscriptFolder;
            const isInManuscriptFolder = 
                !manuscriptFolderPath || abstractFile.path.includes(manuscriptFolderPath.replace(/^\/+|\/+$/g, ''));
            
            if (isInManuscriptFolder) {
                this.debugLog(`File in manuscript folder changed: ${abstractFile.path}`);
                const metadata = this.app.metadataCache.getFileCache(abstractFile);
                if (metadata && metadata.frontmatter) {
                    this.debugLog(`Frontmatter detected:`, metadata.frontmatter);
                    if (metadata.frontmatter["Publish Stage"]) {
                        this.debugLog(`Publish Stage changed to: ${metadata.frontmatter["Publish Stage"]}`);
                    }
                }
                
                setTimeout(() => {
                    if (this.app.plugins.plugins.dataview?.api?.index) {
                        this.app.plugins.plugins.dataview.api.index.touch();
                        setTimeout(() => {
                            this.app.workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT_CALENDAR).forEach(leaf => {
                                if (leaf.view instanceof ManuscriptCalendarView) {
                                    (leaf.view as ManuscriptCalendarView).refreshCalendar();
                                    this.debugLog("Calendar refreshed due to file change");
                                }
                            });
                        }, 300);
                    } else {
                        this.app.workspace.getLeavesOfType(VIEW_TYPE_MANUSCRIPT_CALENDAR).forEach(leaf => {
                            if (leaf.view instanceof ManuscriptCalendarView) {
                                (leaf.view as ManuscriptCalendarView).refreshCalendar();
                            }
                        });
                    }
                }, 100);
            }
        }
    }

    onunload() {
        this.debugLog('Unloading Manuscript Calendar plugin...');
        
        try {
            // All registered events are automatically unregistered by Obsidian's Plugin system
            this.debugLog('Manuscript Calendar plugin unloaded successfully');
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
        // Log the loaded setting
        this.debugLog("[Internal Check] Settings loaded, debugMode:", this.settings.debugMode);
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

    async display() {
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
                    .setValue(currentValue ?? '')
                    .onChange(async (value) => {
                        // Ensure value is never null/undefined by converting to empty string
                        const newValue = value ?? '';
                        this.plugin.settings.manuscriptFolder = newValue;
                        await this.plugin.saveSettings();
                    });
            });

        // Add Debug Mode Toggle
        new Setting(containerEl)
            .setName('Debug Mode')
            .setDesc('Enable detailed console logging for troubleshooting.')
            .addToggle(toggle => 
                toggle
                    .setValue(this.plugin.settings.debugMode ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.debugMode = value;
                        await this.plugin.saveSettings();
                        // This log should always show, so use console.log directly
                        console.log("Manuscript Calendar Debug Mode:", value ? "ON" : "OFF");
                    })
            );

        // -- Load and Display README.md --
        containerEl.createEl('hr'); // Add a separator line
        const readmeContainer = containerEl.createDiv({ cls: 'manuscript-calendar-readme-container' });

        const pluginDir = this.plugin.manifest.dir;

        if (!pluginDir) {
            readmeContainer.createEl('p', { text: 'Could not determine plugin directory to load README.md.' });
            console.error('Plugin directory (manifest.dir) is undefined.');
            return; // Stop if we don't have the directory
        }

        try {
            // Construct the path to README.md relative to the vault root
            const readmePath = `${pluginDir}/README.md`;
            this.plugin.debugLog(`Attempting to load README from: ${readmePath}`);

            // Read the README.md file content
            const readmeContent = await this.app.vault.adapter.read(readmePath);
            this.plugin.debugLog(`README content loaded successfully.`);

            // Render the README markdown content
            await MarkdownRenderer.renderMarkdown(
                readmeContent,
                readmeContainer,
                pluginDir, // Use the guaranteed pluginDir string
                this.plugin // Component context
            );
        } catch (error) {
            this.plugin.debugLog('Error loading or rendering README.md:', error);
            readmeContainer.createEl('p', { text: `Could not load README.md from ${pluginDir}. Ensure the file exists.` });
            console.error('Error loading README.md for settings tab:', error);
        }
    }
}

class ManuscriptCalendarView extends ItemView {
    plugin: ManuscriptCalendarPlugin;
    currentDate: Date;
    calendarTable: HTMLTableElement;
    currentHighestStage: string = "ZERO"; // Default value
    completedWeekStats: Map<string, WeekStats> = new Map();
    
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

    // Add back the helper function using the plugin's logger
    private debugLog(message: string, ...optionalParams: any[]) {
        this.plugin.debugLog(`[View] ${message}`, ...optionalParams);
    }

    getWeekNumber(date: Date): number {
        const currentYear = date.getFullYear();
        const targetDate = new Date(Date.UTC(currentYear, date.getMonth(), date.getDate()));

        // Find the Sunday of the current week
        const dayOfWeek = targetDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
        const sundayDate = new Date(targetDate);
        sundayDate.setUTCDate(targetDate.getUTCDate() - dayOfWeek);

        // --- Special Case: Check if this week contains Jan 1st of the *next* year ---
        const nextYear = currentYear + 1;
        const firstOfNextYear = new Date(Date.UTC(nextYear, 0, 1));
        const saturdayDate = new Date(sundayDate);
        saturdayDate.setUTCDate(sundayDate.getUTCDate() + 6);

        if (sundayDate < firstOfNextYear && saturdayDate >= firstOfNextYear) {
            // Use the view's helper
            this.debugLog(`Week calculation for ${date.toDateString()}: Falls into Week 1 of ${nextYear}`);
            return 1;
        }
        // --- End Special Case ---

        // Find Jan 1st of the current year
        const firstOfCurrentYear = new Date(Date.UTC(currentYear, 0, 1));

        // Find the Sunday of the week containing Jan 1st
        const firstDayOfYearDayOfWeek = firstOfCurrentYear.getUTCDay();
        const firstWeekSunday = new Date(firstOfCurrentYear);
        firstWeekSunday.setUTCDate(firstOfCurrentYear.getUTCDate() - firstDayOfYearDayOfWeek);

        // Calculate the difference in days between the target week's Sunday and the first week's Sunday
        // Ensure we are comparing dates at the same time (midnight UTC)
        const diffTime = sundayDate.getTime() - firstWeekSunday.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        // Calculate the week number
        const weekNo = Math.floor(diffDays / 7) + 1;

        // Use the view's helper
        this.debugLog(`Apple-Style Week calculation for ${date.toDateString()}:`, {
            inputDate: date.toDateString(),
            weekSunday: sundayDate.toISOString(),
            firstWeekSunday: firstWeekSunday.toISOString(),
            diffDays,
            calculatedWeekNumber: weekNo
        });

        return weekNo;
    }

    // Helper method to get the start of a week for a given date
    getWeekStart(date: Date): Date {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        d.setDate(d.getDate() - day); // Go back to Sunday
        return d;
    }

    // Helper method to check if two dates are in the same week
    isSameWeek(date1: Date, date2: Date): boolean {
        const week1Start = this.getWeekStart(date1);
        const week2Start = this.getWeekStart(date2);
        return week1Start.getTime() === week2Start.getTime();
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
    
    // Method to change month that handles date properly
    async changeMonth(delta: number): Promise<void> {
        // Create a clean new Date object with the first day of the new month
        const newYear = this.currentDate.getFullYear();
        const newMonth = this.currentDate.getMonth() + delta;
        this.currentDate = new Date(newYear, newMonth, 1);
        await this.refreshCalendar();
    }

    // Method to refresh the calendar data and display
    async refreshCalendar(): Promise<void> {
        // Force a complete redraw of the calendar to ensure all data is updated
        await this.renderCalendar().then(() => {
            // Use the view's helper
            this.debugLog('Calendar refreshed successfully');
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
        
        // Use Obsidian's built-in icon system
        setIcon(prevButton, 'chevron-left');
        
        // Add today button between arrows
        const todayButton = navButtons.createEl('button', { 
            text: 'TODAY',
            cls: 'today-button'
        });
        
        // Add right arrow with SVG
        const nextButton = navButtons.createEl('button', { 
            cls: 'nav-button next-month'
        });
        
        // Use Obsidian's built-in icon system
        setIcon(nextButton, 'chevron-right');
        
        // Update month display
        const updateMonthDisplay = async () => {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            // Clear the text content and create elements
            monthDisplay.empty();
            
            // Create month text
            const monthText = document.createElement('span');
            monthText.textContent = months[this.currentDate.getMonth()];
            monthText.className = 'month-text';
            monthDisplay.appendChild(monthText);
            
            // Add space between month and year
            monthDisplay.appendChild(document.createTextNode(' '));
            
            // Create year text
            const yearText = document.createElement('span');
            yearText.textContent = this.currentDate.getFullYear().toString();
            yearText.className = 'year-text';
            monthDisplay.appendChild(yearText);
            
            // Default to ZERO stage
            let highestStage = "ZERO";
            
            try {
                if (this.app.plugins.plugins.dataview) {
                    const dataviewApi = this.app.plugins.plugins.dataview.api;
                    let pages: any[] = [];
                    
                    // Get all pages with dataview
                    try {
                        pages = await dataviewApi.pages();
                    } catch (e) {
                        console.error("Error getting pages:", e);
                    }
                    
                    // Define stages in order of advancement (lowest to highest)
                    const stages = ["ZERO", "AUTHOR", "HOUSE", "PRESS"];
                    
                    // Map for stage ranking
                    const stageRank = new Map<string, number>();
                    stages.forEach((stage, index) => {
                        stageRank.set(stage, index);
                    });
                    
                    // Current highest stage index
                    let highestStageIndex = 0;
                    
                    // Check each page for Publish Stage
                    pages.forEach(page => {
                        if (page["Publish Stage"]) {
                            let pageStage = String(page["Publish Stage"]).toUpperCase();
                            
                            // Handle legacy naming
                            if (pageStage === "FIRST") pageStage = "AUTHOR";
                            if (pageStage === "EDITING") pageStage = "HOUSE";
                            
                            // Check if this stage is higher than current highest
                            const stageIndex = stageRank.get(pageStage) ?? 0;
                            if (stageIndex > highestStageIndex) {
                                highestStageIndex = stageIndex;
                                highestStage = stages[highestStageIndex];
                            }
                        }
                    });
                    
                    // Store the highest stage for use in renderCalendarBody
                    this.currentHighestStage = highestStage;
                }
            } catch (e) {
                console.error("Error determining highest publish stage:", e);
                this.currentHighestStage = "ZERO"; // Default fallback
            }
            
            // Create and add the stage indicator element as an exponent
            const stageIndicator = document.createElement('span');
            stageIndicator.className = 'stage-indicator';
            stageIndicator.textContent = this.currentHighestStage;
            stageIndicator.classList.add(`stage-${this.currentHighestStage.toLowerCase()}`);
            monthDisplay.appendChild(stageIndicator);
        };
        
        await updateMonthDisplay();
        
        // Add event listeners for month navigation
        prevButton.addEventListener('click', async () => {
            this.changeMonth(-1);
        });
        
        nextButton.addEventListener('click', async () => {
            this.changeMonth(1);
        });
        
        todayButton.addEventListener('click', async () => {
            this.currentDate = new Date();
            await updateMonthDisplay();
            this.refreshCalendar();
        });
        
        // Create calendar table
        const calendarTable = container.createEl('table', { cls: 'manuscript-calendar' });
        
        // Create header row
        const headerRow = calendarTable.createEl('tr');
        
        // Add the week number header with a separator
        const weekHeader = headerRow.createEl('th', { text: 'W', cls: 'week-number week-separator' });
        
        // Updated day labels with three letters
        const dayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        dayLabels.forEach(day => {
            headerRow.createEl('th', { text: day });
        });
        
        // Store the table for later updates
        this.calendarTable = calendarTable;
        
        // Render the calendar body
        await this.renderCalendarBody();
        
        // Create legend container
        const legendContainer = container.createDiv({ cls: 'legend-container' });
        
        // Create legend wrapper div
        const legendWrapper = legendContainer.createDiv({ cls: 'legend-wrapper' });
        
        // Create the calendar legend div
        const calendarLegend = legendWrapper.createDiv({ cls: 'calendar-legend' });
        
        // Create legend items using DOM methods instead of innerHTML
        const legendItems = [
            { cls: 'stage-zero', label: 'ZERO', icon: 'circle-slash' },
            { cls: 'stage-author', label: 'AUTHOR', icon: 'smile' },
            { cls: 'stage-house', label: 'HOUSE', icon: 'landmark' },
            { cls: 'stage-press', label: 'PRESS', icon: 'printer' }
        ];
        
        legendItems.forEach(item => {
            const legendItem = calendarLegend.createDiv({ cls: 'legend-item' });
            
            // Create the swatch div with specific stage class
            const legendSwatch = legendItem.createDiv({ cls: `legend-swatch ${item.cls}` });
            
            // Use Obsidian's setIcon function
            setIcon(legendSwatch, item.icon);
            
            const legendLabel = legendItem.createSpan({ cls: 'legend-label', text: item.label });
        });
    }

    // Helper function to parse word count from metadata
    private parseWordCount(wordCount: any): number {
        if (typeof wordCount === 'number') {
            return wordCount;
        }
        
        if (typeof wordCount === 'string') {
            // Remove commas and any whitespace
            const cleanCount = wordCount.replace(/,/g, '').trim();
            const parsed = parseInt(cleanCount, 10);
            return isNaN(parsed) ? 0 : parsed;
        }
        
        return 0;
    }

    async renderCalendarBody() {
        // Clear existing visual rows except header
        const rows = this.calendarTable.querySelectorAll('tr:not(:first-child)');
        rows.forEach(row => row.remove());

        // **** Reset weekly stats before recalculating ****
        this.completedWeekStats.clear(); 
        // ************************************************
        
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
        
        // Track completed scenes by week and stage
        const completedScenesByWeekAndStage = new Map<string, Map<string, number>>();
        
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
                
                // Track all completed scenes 
                const completedScenes: { date: Date, isStageZeroFresh: boolean, isOtherStage: boolean }[] = [];
                
                // Process all pages
                if (pages.length > 0) {
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
                            
                            // Only count scenes up to today
                            if (dueDate > today) return;
                        
                        // Format date as YYYY-MM-DD
                        const dateKey = dueDate.toISOString().split('T')[0];
                            
                            // Get week for the date
                            const weekNum = this.getWeekNumber(dueDate);
                            const weekYear = `${dueDate.getFullYear()}-W${weekNum}`;

                            // Get word count from the page using the new parseWordCount function
                            const wordCount = this.parseWordCount(page["Words"] || page["Word Count"] || 0);
                        
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
                        
                            // Add logging BEFORE the decision is made
                            // Use the view's helper
                            this.debugLog(`Checking scene for ratio count:`, {
                                scenePath: page.file.path,
                                scenePublishStage: publishStage,
                                sceneRevision: revision,
                                calendarCurrentHighestStage: this.currentHighestStage
                            });

                            // --- Conditional Counting Logic --- 
                            let shouldCountScene = false;
                            if (this.currentHighestStage === "ZERO") {
                                // For ZERO stage, count only if stage is ZERO and revision is 0
                                if (publishStage === "ZERO" && revision === 0) {
                                    shouldCountScene = true;
                                }
                            } else {
                                // For AUTHOR, HOUSE, PRESS stages, count if stage matches, regardless of revision
                                if (publishStage === this.currentHighestStage) {
                                    shouldCountScene = true;
                                }
                            }

                            if (shouldCountScene) {
                                // Update week stats only if the scene should be counted
                                if (!this.completedWeekStats.has(weekYear)) {
                                    this.completedWeekStats.set(weekYear, {
                                        sceneCount: 0,
                                        wordCount: 0
                                    });
                                }
                                const stats = this.completedWeekStats.get(weekYear)!;
                                stats.sceneCount++;
                                stats.wordCount += wordCount;

                                // Add detailed logging for week stats update (only when counted)
                                // Use the view's helper
                                this.debugLog(`Counted scene for week ${weekYear} (Stage: ${this.currentHighestStage}, Scene Stage: ${publishStage}, Revision: ${revision})`, {
                                    scenePath: page.file.path,
                                    dueDate: dateKey,
                                    newSceneCount: stats.sceneCount,
                                    addedWordCount: wordCount,
                                    newTotalWordCount: stats.wordCount
                                });
                            } else {
                                // Log skipped scenes for clarity
                                // Use the view's helper
                                this.debugLog(`Skipped scene for week ${weekYear} ratio count (Stage: ${this.currentHighestStage}, Scene Stage: ${publishStage}, Revision: ${revision})`, {
                                    scenePath: page.file.path
                                });
                            }
                            // --- End Conditional Counting Logic ---

                            // Track scenes by week and stage for week completion indicators (this is separate)
                            if (!completedScenesByWeekAndStage.has(weekYear)) {
                                completedScenesByWeekAndStage.set(weekYear, new Map<string, number>());
                                
                                // Debug: Log the start of week tracking for this week
                                // Use the view's helper
                                const weekStart = new Date(dueDate);
                                weekStart.setDate(dueDate.getDate() - dueDate.getDay()); // Set to Sunday
                                const weekEnd = new Date(weekStart);
                                weekEnd.setDate(weekStart.getDate() + 6); // Set to Saturday
                                
                                this.debugLog(`New week tracking for ${weekYear}`, {
                                    weekStart: weekStart.toDateString(),
                                    weekEnd: weekEnd.toDateString(),
                                    dueDate: dueDate.toDateString(),
                                    dayOfWeek: dueDate.getDay()
                                });
                            }
                            
                            const stageCount = completedScenesByWeekAndStage.get(weekYear)!;
                            const count = stageCount.get(publishStage) || 0;
                            stageCount.set(publishStage, count + 1);
                            
                            // Debug: Log the scene count update
                            // Use the view's helper
                            this.debugLog(`Adding scene for ${weekYear}`, {
                                date: dueDate.toDateString(),
                                stage: publishStage,
                                newCount: count + 1,
                                scenePath: page.file.path
                            });
                            
                            // Rest of the original code to populate revisionMap and notesByDate
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
                
                // Track completed scenes by week
                completedScenes.forEach(scene => {
                    const weekYear = `${scene.date.getFullYear()}-W${this.getWeekNumber(scene.date)}`;
                    // We're already tracking scenes by week and stage with the correct implementation above
                });
            }
        } catch (e) {
            console.error("Error rendering calendar body:", e);
        }
        
        // Helper function to check if a date is today
        function isToday(date: Date): boolean {
            const today = new Date();
            return date.getDate() === today.getDate() &&
                date.getMonth() === today.getMonth() &&
                date.getFullYear() === today.getFullYear();
        }
        
        // Render the calendar
        let currentDate = new Date(firstDisplayDay);
        
        // Tooltip data storage using WeakMap to avoid memory leaks
        const tooltipData = new WeakMap();
        
        // Render until we reach the last day of the current month or complete the week
        while (currentDate <= lastDay || currentDate.getDay() !== 0) {
            // Create week row
            const weekRow = this.calendarTable.createEl('tr');
            
            // Add week number cell
            const weekNum = this.getWeekNumber(currentDate);
            const weekYear = `${currentDate.getFullYear()}-W${weekNum}`;
            const weekCell = weekRow.createEl('td', { 
                cls: 'week-number week-separator' 
            });

            // Get stats for this week
            const weekStats = this.completedWeekStats.get(weekYear);
            
            // Always create the week number span, but maybe add a class later
            const weekNumSpan = weekCell.createSpan({
                cls: 'week-number-small',
                text: weekNum.toString()
            });

            if (weekStats && weekStats.sceneCount >= 2) {
                // Add class to hide the week number span via CSS
                weekNumSpan.classList.add('hidden-week-number');

                // Add appropriate stage class first, so SVG inherits color
                weekCell.addClass(`stage-${this.currentHighestStage.toLowerCase()}`);
                
                // Create SVG - ensuring proper params
                // Use the view's helper
                this.debugLog(`Creating SVG ratio for week ${weekNum} with stats:`, {
                    sceneCount: weekStats.sceneCount,
                    wordCount: weekStats.wordCount,
                    denominator: Math.floor(weekStats.wordCount / 100)
                });
                
                // Create and append the SVG
                const svg = createRatioSVG(weekStats.sceneCount, Math.floor(weekStats.wordCount / 100));
                weekCell.appendChild(svg);
            }
            
            // Create day cells for each day of the week
            for (let i = 0; i < 7; i++) {
                // IMPORTANT: Save the current date for this cell before it's modified in the loop
                // This ensures that each cell uses the correct date regardless of loop position
                const cellDate = new Date(currentDate);
                const dateKey = cellDate.toISOString().split('T')[0];
                const isCurrentMonth = cellDate.getMonth() === currentMonth;
                const isToday = cellDate.toDateString() === today.toDateString();
                
                // Create day cell with appropriate classes
                const dayCell = weekRow.createEl('td', {
                    text: cellDate.getDate().toString()
                });
                
                // Store the date with the cell for event handlers to use
                dayCell.dataset.date = dateKey;
                
                // Add appropriate classes based on the date
                if (!isCurrentMonth) {
                    dayCell.addClass('other-month');
                }
                
                if (isToday) {
                    dayCell.addClass('today');
                }
                
                // First add a real placeholder dot to maintain vertical spacing
                // This will be shown or hidden later based on whether real dots are added
                const placeholderDot = dayCell.createDiv({
                    cls: 'revision-dot placeholder-dot' 
                });
                
                // Variable to track if we've added any real dots
                let hasAddedRealDot = false;
                
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
                    if (isOverdue) {
                        // Always prioritize overdue status with a red dot
                        const overdueDot = dayCell.createDiv({
                            cls: 'revision-dot overdue'
                        });
                        hasAddedRealDot = true;
                        
                        // If we also have completed scenes, we still want to show them in the tooltip
                        // but the visual indicator (dot) will be red for overdue priority
                    }
                    
                    // If it's a future task and not a completed scene
                    else if (isFutureTask && !hasScenes) {
                        // Create indicator for future todos
                        const futureTodoDot = dayCell.createDiv({
                            cls: 'revision-dot future-todo-dot'
                        });
                        hasAddedRealDot = true;
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
                            // Use the view's helper
                            this.debugLog(`Date ${dateKey} has stages:`, Array.from(stagesForDate));
                            this.debugLog(`Stage checks:`, stageChecks);
                            
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
                                    // Use the view's helper
                                    this.debugLog(`Adding dot for stage ${check.stage}`);
                                    
                                    const revisionDot = dayCell.createDiv({
                                        cls: `revision-dot ${check.cls}`
                                    });
                                    hasAddedRealDot = true;
                                    
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
                                hasAddedRealDot = true;
                                
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
                    
                    // Add click handler to open notes for this date
                    dayCell.addEventListener('click', (event) => {
                        // Use the stored date key from the dataset
                        const cellDateKey = dayCell.dataset.date || dateKey;
                        const notesForDate = notesByDate.get(cellDateKey) || [];
                        
                        if (notesForDate.length === 0) {
                            return;
                        }
                        
                        // Get all open leaves (tabs) in the workspace
                        const openLeaves = this.app.workspace.getLeavesOfType('markdown');
                        const openFiles = new Map<string, WorkspaceLeaf>();
                        
                        // Create a map of already open files
                        openLeaves.forEach(leaf => {
                            // Get the file path if available
                            const viewState = leaf.getViewState();
                            const filePath = viewState.state?.file;
                            
                            if (filePath && typeof filePath === 'string') {
                                openFiles.set(filePath, leaf);
                            }
                        });
                        
                        // Track if we've activated any existing tab
                        let hasActivatedExistingTab = false;
                        
                        // First, check if any of the notes for this date are already open
                        for (const note of notesForDate) {
                            const filePath = note.file.path;
                            
                            // If this file is already open in a tab, reveal that tab
                            if (openFiles.has(filePath)) {
                                const existingLeaf = openFiles.get(filePath);
                                if (existingLeaf) {
                                    this.app.workspace.revealLeaf(existingLeaf);
                                    hasActivatedExistingTab = true;
                                    break; // Stop after finding and activating the first open tab
                                }
                            }
                        }
                        
                        // If we didn't activate any existing tab, open the notes in tabs
                        if (!hasActivatedExistingTab) {
                            // Track which files we've processed to avoid duplicates
                            const processedFiles = new Set<string>();
                            
                            notesForDate.forEach((note, index) => {
                                const filePath = note.file.path;
                                
                                // Skip if already processed or already open
                                if (processedFiles.has(filePath) || openFiles.has(filePath)) {
                                    return;
                                }
                                
                                // Mark as processed
                                processedFiles.add(filePath);
                                
                            const file = this.app.vault.getAbstractFileByPath(filePath);
                            if (file && file instanceof TFile) {
                                    // Always open in new tab
                                    this.app.workspace.openLinkText(
                                        file.path,
                                        "",
                                        true, // Open in new tab
                                        { active: index === 0 } // Only activate the first tab
                                    );
                                }
                            });
                        }
                    });
                    
                    // Add mouse enter/leave handlers for tooltip
                    let tooltipElement: HTMLElement | null = null;
                    
                    dayCell.addEventListener('mouseenter', () => {
                        // Use the stored date key from the dataset
                        const cellDateKey = dayCell.dataset.date || dateKey;
                        // Check if there are notes for this date
                        const notesForDate = notesByDate.get(cellDateKey) || [];
                        
                        if (notesForDate.length === 0) {
                            return;
                        }
                        
                        // IMPORTANT: Create a proper clone of the date for this specific cell
                        // This is critical - we must use the dateKey to create a new date object
                        // to avoid using the wrong date (which might be advanced from the loop)
                        // Add time part to ensure date is parsed correctly with local timezone
                        const cellDate = new Date(`${cellDateKey}T12:00:00`);
                        
                        // Debug: log the tooltip creation with more detailed information
                        // Use the view's helper
                        this.debugLog(`Creating tooltip for ${cellDateKey}`, {
                            dateKey: cellDateKey,
                            date: cellDate.toDateString(),
                            sceneCount: notesForDate.length,
                            dateHasRevisionMap: revisionMap.has(cellDateKey),
                            revisionsForDate: revisionMap.get(cellDateKey),
                            weekNumber: this.getWeekNumber(cellDate)
                        });
                        
                            // Create tooltip
                            tooltipElement = document.createElement('div');
                            tooltipElement.className = 'calendar-tooltip';
                            
                        // Create and populate tooltip content
                            // Organize notes by category
                            const overdueNotes = notesForDate.filter(page => 
                                !page.Status || 
                                (typeof page.Status === 'string' && page.Status !== 'Complete') ||
                                (Array.isArray(page.Status) && !page.Status.includes('Complete'))
                            );
                            
                            const completedNotes = notesForDate.filter(page => 
                                page.Status && 
                                ((typeof page.Status === 'string' && page.Status === 'Complete') ||
                                (Array.isArray(page.Status) && page.Status.includes('Complete')))
                            );
                            
                            // Add overdue section if there are overdue notes
                            if (isOverdue && overdueNotes.length > 0) {
                                const overdueSection = document.createElement('div');
                                overdueSection.className = 'tooltip-section overdue-section';
                                
                                const overdueHeading = document.createElement('h4');
                                overdueHeading.textContent = 'Overdue Scenes';
                                overdueSection.appendChild(overdueHeading);
                                
                                const overdueList = document.createElement('ul');
                                overdueNotes.forEach(note => {
                                    const item = document.createElement('li');
                                    item.textContent = note.file.path.split('/').pop()?.replace('.md', '') || '';
                                    overdueList.appendChild(item);
                                });
                                
                                overdueSection.appendChild(overdueList);
                                tooltipElement.appendChild(overdueSection);
                            }
                            
                            // Add completed notes section
                            if (completedNotes.length > 0) {
                                const completedSection = document.createElement('div');
                                completedSection.className = 'tooltip-section completed-section';
                                
                                const completedHeading = document.createElement('h4');
                                completedHeading.textContent = 'Completed Scenes';
                                completedSection.appendChild(completedHeading);
                                
                                const completedList = document.createElement('ul');
                                completedNotes.forEach(note => {
                                    const item = document.createElement('li');
                                    
                                    // Get revision number, default to 0 if missing/invalid
                                    const revision = typeof note.Revision === 'number' ? note.Revision : 0;
                                    
                                    // Add appropriate class based on publish stage
                                    const publishStage = note["Publish Stage"] || "ZERO";
                                    const stageClass = publishStage.toString().toUpperCase() === "ZERO" ? "stage-zero" :
                                                     publishStage.toString().toUpperCase() === "AUTHOR" || publishStage === "First" ? "stage-author" :
                                                     publishStage.toString().toUpperCase() === "HOUSE" || publishStage === "Editing" ? "stage-house" :
                                                     "stage-press";
                                    
                                    item.classList.add(stageClass);
                                    
                                    // Set text content including revision number
                                    const sceneName = note.file.path.split('/').pop()?.replace('.md', '') || '';
                                    item.textContent = `${sceneName}[${revision}]`; // Add revision in brackets
                                    
                                    completedList.appendChild(item);
                                });
                                
                                completedSection.appendChild(completedList);
                                tooltipElement.appendChild(completedSection);
                            }
                            
                            // Add future todos section
                            if (isFutureTask) {
                                const futureSection = document.createElement('div');
                                futureSection.className = 'tooltip-section future-section';
                                
                                const futureHeading = document.createElement('h4');
                                futureHeading.textContent = 'Planned Scenes';
                                futureSection.appendChild(futureHeading);
                                
                                const futureList = document.createElement('ul');
                                notesForDate.filter(page => 
                                    page.Status && 
                                    ((typeof page.Status === 'string' && page.Status === 'Todo') ||
                                    (Array.isArray(page.Status) && page.Status.includes('Todo')))
                                ).forEach(note => {
                                    const item = document.createElement('li');
                                    item.textContent = note.file.path.split('/').pop()?.replace('.md', '') || '';
                                    futureList.appendChild(item);
                                });
                                
                                futureSection.appendChild(futureList);
                                tooltipElement.appendChild(futureSection);
                            }
                            
                        // Get cell position
                            const cellRect = dayCell.getBoundingClientRect();
                        
                        // Create simplified tooltip container
                        const tooltipContainer = document.createElement('div');
                        tooltipContainer.className = 'tooltip-container';
                        document.body.appendChild(tooltipContainer);
                        
                        // Add the actual tooltip directly to the container
                        tooltipContainer.appendChild(tooltipElement);
                        
                        // Calculate dimensions and positions
                        const centerX = cellRect.left + (cellRect.width / 2);
                        const tooltipRect = tooltipElement.getBoundingClientRect();
                        const tooltipWidth = tooltipRect.width;
                        const tooltipHeight = tooltipRect.height;
                        const windowWidth = window.innerWidth;
                        const windowHeight = window.innerHeight;
                        
                        // Calculate the cell's horizontal position within the calendar
                        const calendarRect = this.calendarTable.getBoundingClientRect();
                        const calendarColumns = Array.from(this.calendarTable.querySelector('tr:first-child')?.querySelectorAll('th') || []);
                        const dayIndex = Array.from(dayCell.parentElement?.children || []).indexOf(dayCell);
                        const isLeftEdgeColumn = dayIndex <= 1; // First or second column (includes week number)
                        const isRightEdgeColumn = dayIndex >= 5; // Last or second-to-last column
                        
                        // Safety margin
                        const safetyMargin = 20;
                        
                        // Get the row index in the calendar (1-based)
                        const calendarRows = this.calendarTable.querySelectorAll('tr');
                        const rowElements = Array.from(calendarRows).slice(1); // Skip header row
                        const rowIndex = rowElements.findIndex(row => row.contains(dayCell)) + 1;
                        const totalRows = rowElements.length;
                        
                        // Determine if we're in the bottom two rows of the calendar
                        const isInBottomTwoRows = rowIndex >= totalRows - 1;
                        
                        // For bottom two rows, show tooltip above; otherwise show below
                        const showAbove = isInBottomTwoRows;
                        
                        // Apply vertical positioning
                        if (showAbove) {
                            tooltipContainer.classList.add('v-pos-above');
                        } else {
                            tooltipContainer.classList.add('v-pos-below');
                        }
                        
                        // Edge detection based on both pixel calculation and column position
                        // This ensures tooltips stay within the window
                        const pixelBasedRightEdge = centerX + (tooltipWidth / 2) > windowWidth - safetyMargin;
                        
                        // For left edge, check against calendar left edge, not window
                        const calendarLeftEdge = calendarRect.left;
                        const pixelBasedLeftEdge = centerX - (tooltipWidth / 2) < calendarLeftEdge + safetyMargin;
                        
                        // Prefer column-based positioning first, fall back to pixel-based for edge cases
                        const isNearRightEdge = isRightEdgeColumn || pixelBasedRightEdge;
                        const isNearLeftEdge = isLeftEdgeColumn || pixelBasedLeftEdge;
                        
                        // Determine horizontal position
                        let finalLeft = centerX;
                        
                        if (isNearRightEdge) {
                            // Right-align tooltip (20px from right edge of window)
                            finalLeft = windowWidth - safetyMargin;
                            tooltipContainer.classList.add('right-aligned');
                        } else if (isNearLeftEdge) {
                            // Left-align tooltip (20px from left edge of calendar)
                            finalLeft = calendarLeftEdge + safetyMargin;
                            tooltipContainer.classList.add('left-aligned');
                        }
                        
                        // Create positioning style
                        const styleEl = document.createElement('style');
                        const top = showAbove ? Math.round(cellRect.top) : Math.round(cellRect.bottom);
                        
                        styleEl.textContent = `
                            .tooltip-container.pos-x-${Math.round(centerX)}.pos-y-${top} {
                                left: ${finalLeft}px;
                                top: ${top}px;
                            }
                        `;
                        
                        // Add classes for specific positioning
                        tooltipContainer.classList.add(`pos-x-${Math.round(centerX)}`);
                        tooltipContainer.classList.add(`pos-y-${top}`);
                        
                        // Add the style to the document
                        document.head.appendChild(styleEl);
                        
                        // Store references without modifying HTMLElement
                        const tooltipData = new WeakMap<HTMLElement, {
                            container: HTMLElement;
                            styleElement: HTMLElement;
                        }>();
                        
                        tooltipData.set(tooltipElement, {
                            container: tooltipContainer,
                            styleElement: styleEl
                        });
                        
                        dayCell.addEventListener('mouseleave', function cleanup() {
                            if (tooltipElement) {
                                const data = tooltipData.get(tooltipElement);
                                if (data) {
                                    // Remove container from DOM
                                    data.container.remove();
                                    
                                    // Remove style element
                                    data.styleElement.remove();
                                    
                                    // Clean up the weakmap
                                    tooltipData.delete(tooltipElement);
                                }
                                
                                tooltipElement = null;
                                
                                // Remove this specific handler
                                dayCell.removeEventListener('mouseleave', cleanup);
                            }
                        });
                    });
                }
                
                // If we've added any real dots, hide the placeholder
                if (hasAddedRealDot) {
                    placeholderDot.addClass('hidden');
                }
                
                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
    }
} 