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
    numeratorText.setAttribute("x", "10");
    numeratorText.setAttribute("y", "10");
    numeratorText.setAttribute("text-anchor", "middle");
    numeratorText.classList.add("ratio-numerator");
    numeratorText.textContent = numerator.toString();
    svg.appendChild(numeratorText);

    // Create horizontal line
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "3");
    line.setAttribute("y1", "13");
    line.setAttribute("x2", "17");
    line.setAttribute("y2", "13");
    line.classList.add("ratio-line");
    svg.appendChild(line);

    // Create denominator text
    const denominatorText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    denominatorText.setAttribute("x", "10");
    denominatorText.setAttribute("y", "23");
    denominatorText.setAttribute("text-anchor", "middle");
    denominatorText.classList.add("ratio-denominator");
    denominatorText.textContent = denominator.toString();
    svg.appendChild(denominatorText);

    return svg;
}

// *** NEW Helper Function ***
function isNoteComplete(note: DataviewPage | undefined | null): boolean {
    if (!note || !note.Status) return false;
    const status = note.Status;
    if (Array.isArray(status)) {
        return status.some(s => typeof s === 'string' && s.trim().toLowerCase() === 'complete');
    }
    return typeof status === 'string' && status.trim().toLowerCase() === 'complete';
}
// *** End Helper Function ***

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
        const navControls = monthSelector.createDiv({ cls: 'nav-controls' });
        
        // Add left arrow with SVG - use span instead of button to avoid default padding
        const prevButton = navControls.createSpan({ 
            cls: 'nav-btn prev-month',
            attr: { role: 'button', tabindex: '0' }
        });
        
        // Use Obsidian's built-in icon system
        setIcon(prevButton, 'chevron-left');
        
        // Ensure it does not get clickable-icon padding
        prevButton.classList.remove('clickable-icon');
        
        // Add today button between arrows
        const todayButton = navControls.createSpan({ 
            text: 'TODAY',
            cls: 'today-button',
            attr: { role: 'button', tabindex: '0' }
        });
        
        // Add right arrow with SVG
        const nextButton = navControls.createSpan({ 
            cls: 'nav-btn next-month',
            attr: { role: 'button', tabindex: '0' }
        });
        
        // Use Obsidian's built-in icon system
        setIcon(nextButton, 'chevron-right');
        
        // Prevent default clickable-icon padding if added
        nextButton.classList.remove('clickable-icon');
        
        // Update month display
        const updateMonthDisplay = async () => {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            // Clear the text content 
            monthDisplay.empty();
            
            // Create a container for month/year and stage info
            const headerContainer = document.createElement('div');
            headerContainer.className = 'month-year-stage-container';
            monthDisplay.appendChild(headerContainer);
            
            // Create month text
            const monthText = document.createElement('span');
            monthText.textContent = months[this.currentDate.getMonth()];
            monthText.className = 'month-text';
            headerContainer.appendChild(monthText);
            
            // Add space between month and year
            headerContainer.appendChild(document.createTextNode(' '));
            
            // Create year text - only show last 2 digits
            const yearText = document.createElement('span');
            const fullYear = this.currentDate.getFullYear().toString();
            yearText.textContent = "'" + fullYear.substring(fullYear.length - 2); // Add apostrophe
            yearText.className = 'year-text';
            headerContainer.appendChild(yearText);
            
            // Default to ZERO stage
            let highestStage = "ZERO";
            
            // **** Calculate Stage Counts ****
            const stageCounts = new Map<string, number>([
                ["ZERO", 0],
                ["AUTHOR", 0],
                ["HOUSE", 0],
                ["PRESS", 0]
            ]);
            
            try {
                if (this.app.plugins.plugins.dataview) {
                    const dataviewApi = this.app.plugins.plugins.dataview.api;
                    let pages: any[] = [];
                    
                    // Get folder path from settings, same logic as in renderCalendarBody
                    const rawFolderPath = this.plugin.settings.manuscriptFolder;
                    let folderPath = (rawFolderPath === undefined || rawFolderPath === null) ? "" : rawFolderPath;
                    
                    // Get all pages with dataview
                    try {
                        if (!folderPath || folderPath.trim() === "") {
                            pages = await dataviewApi.pages();
                        } else {
                            folderPath = folderPath.trim().replace(/^\/+|\/+$/g, '');
                            pages = await dataviewApi.pages(`folder:"${folderPath}"`);
                        }
                    } catch (e) {
                        console.error("Error getting pages:", e);
                        pages = await dataviewApi.pages(); // Fallback to all pages
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
                    
                    // Check each page for Publish Stage and count completed scenes by stage
                    pages.forEach(page => {
                        // Handle Publish Stage determination
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
                            
                            // Count completed scenes by stage
                            if (isNoteComplete(page)) {
                                if (stageCounts.has(pageStage)) {
                                    stageCounts.set(pageStage, stageCounts.get(pageStage)! + 1);
                                }
                            }
                        }
                    });
                    
                    // Store the highest stage for use in renderCalendarBody
                    this.currentHighestStage = highestStage;
                    this.debugLog("Current highest stage:", highestStage);
                    this.debugLog("Completed scene counts:", Object.fromEntries(stageCounts));
                }
            } catch (e) {
                console.error("Error determining highest publish stage:", e);
                this.currentHighestStage = "ZERO"; // Default fallback
            }
            
            // Add the stage icon based on current stage
            const iconMap = {
                "ZERO": "circle-slash",
                "AUTHOR": "smile",
                "HOUSE": "landmark",
                "PRESS": "printer"
            };
            
            // Create the table-like structure for the stage info
            const stageTable = document.createElement('div');
            stageTable.className = 'stage-table';
            
            // Column 1: Icon
            const iconColumn = document.createElement('div');
            iconColumn.className = 'stage-icon-column';
            stageTable.appendChild(iconColumn);
            
            // Create the icon container and add to icon column
            const stageIconContainer = document.createElement('span');
            stageIconContainer.className = 'stage-icon';
            stageIconContainer.classList.add(`stage-${this.currentHighestStage.toLowerCase()}`);
            setIcon(stageIconContainer, iconMap[this.currentHighestStage as keyof typeof iconMap]);
            iconColumn.appendChild(stageIconContainer);
            
            // Column 2: Stage text and count
            const textColumn = document.createElement('div');
            textColumn.className = 'stage-text-column';
            stageTable.appendChild(textColumn);
            
            // Row 1: Stage indicator
            const stageIndicator = document.createElement('span');
            stageIndicator.className = 'stage-indicator';
            stageIndicator.textContent = this.currentHighestStage;
            stageIndicator.classList.add(`stage-${this.currentHighestStage.toLowerCase()}`);
            textColumn.appendChild(stageIndicator);
            
            // Row 2: Count (only if > 0)
            const currentStageCount = stageCounts.get(this.currentHighestStage) || 0;
            if (currentStageCount > 0) {
                const stageCountElement = document.createElement('span');
                stageCountElement.className = 'stage-count';
                stageCountElement.classList.add(`stage-${this.currentHighestStage.toLowerCase()}`);
                stageCountElement.textContent = currentStageCount.toString();
                textColumn.appendChild(stageCountElement);
            }
            
            // Add the stage table to the header container
            headerContainer.appendChild(stageTable);
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
        let workingFutureDates = new Set<string>(); // Track future Working dates
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
                    // Add this new section to process Todo and Working scenes with future dates
                    // Get all pages with Todo or Working status
                    const todoOrWorkingPages = pages.filter(page => {
                        const hasSceneClass = page.Class && (
                            Array.isArray(page.Class) 
                                ? page.Class.includes("Scene") 
                                : page.Class === "Scene"
                        );
                        
                        const hasRelevantStatus = page.Status && (
                            (Array.isArray(page.Status) && (page.Status.includes("Todo") || page.Status.includes("Working"))) ||
                            (typeof page.Status === 'string' && (page.Status === "Todo" || page.Status === "Working"))
                        );
                        
                        return hasSceneClass && hasRelevantStatus;
                    });
                    
                    // Process Todo/Working pages to identify future dates
                    todoOrWorkingPages.forEach(page => {
                        if (!page.Due) return;
                        
                        // Parse the Due date
                        let dueDate: Date;
                        try {
                            let rawDate: string = typeof page.Due === 'object' && page.Due.path 
                                ? page.Due.path 
                                : page.Due as string;
                            dueDate = new Date(rawDate);
                            
                            if (isNaN(dueDate.getTime())) return;
                            
                            // Check if the due date is today or in the future (ignoring time)
                            if (dueDate.setHours(0,0,0,0) >= today.setHours(0,0,0,0)) {
                                const dateKey = dueDate.toISOString().split('T')[0];
                                
                                // Determine status and add to appropriate set
                                const isWorking = (Array.isArray(page.Status) && page.Status.includes("Working")) || page.Status === "Working";
                                if (isWorking) {
                                    workingFutureDates.add(dateKey);
                                } else { // Must be Todo
                                    todoFutureDates.add(dateKey);
                                }
                                
                                // Add to notesByDate for potential clicking/opening
                                if (!notesByDate.has(dateKey)) {
                                    notesByDate.set(dateKey, []);
                                }
                                notesByDate.get(dateKey)?.push(page);
                            }
                        } catch (error) {
                            return;
                        }
                    });

                    // **** Restore Overdue Scene Identification ****
                    // Find overdue items - not complete but due date is in the past
                    const overduePages = pages.filter(page => {
                        const isNotComplete = page.Status && (
                            (Array.isArray(page.Status) && !page.Status.includes("Complete")) ||
                            (typeof page.Status === 'string' && page.Status !== "Complete")
                        );

                        const hasSceneClass = page.Class && (
                            Array.isArray(page.Class)
                                ? page.Class.includes("Scene")
                                : page.Class === "Scene"
                        );

                        let isDueDateInPast = false;
                        if (page.Due) {
                            try {
                                let rawDueDate: string = typeof page.Due === 'object' && page.Due.path
                                    ? page.Due.path
                                    : page.Due as string;
                                const dueDate = new Date(rawDueDate);
                                // Check if date is valid and strictly before today (ignoring time)
                                isDueDateInPast = !isNaN(dueDate.getTime()) && dueDate.setHours(0,0,0,0) < today.setHours(0,0,0,0);
                            } catch (error) {
                                isDueDateInPast = false;
                            }
                        }

                        return isNotComplete && hasSceneClass && isDueDateInPast;
                    });

                    // Process overdue pages to populate overdueDates and notesByDate
                    overduePages.forEach(page => {
                        if (!page.Due) return;
                        try {
                            let rawDate: string = typeof page.Due === 'object' && page.Due.path ? page.Due.path : page.Due as string;
                            const dueDate = new Date(rawDate);
                            if (isNaN(dueDate.getTime())) return;

                            const dateKey = dueDate.toISOString().split('T')[0];
                            overdueDates.add(dateKey); // Add to set for quick checking

                            // Ensure overdue notes are also in notesByDate for tooltip/click
                             if (!notesByDate.has(dateKey)) {
                                notesByDate.set(dateKey, []);
                            }
                            // Avoid adding duplicates if already added by future check (unlikely but possible)
                            if (!notesByDate.get(dateKey)?.some(note => note.file.path === page.file.path)) {
                                notesByDate.get(dateKey)?.push(page);
                            }
                        } catch (error) {
                            console.error("Error processing overdue date for identification:", error);
                        }
                    });
                    // **** End Restore Overdue Scene Identification ****

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

                            // Remove the stage-specific check for counting towards the ratio.
                            // Now, ANY completed scene (Class=Scene, Status=Complete, Due<=today)
                            // meeting the filter criteria will contribute to the week's ratio stats.
                            const shouldCountScene = true; // Always count if it reached this point

                            // Add logging BEFORE the decision is made
                            // Use the view's helper
                            this.debugLog(`Checking scene for ratio count (Now always true if Complete/Scene/PastDue):`, {
                                scenePath: page.file.path,
                                scenePublishStage: publishStage,
                                sceneRevision: revision,
                                calendarCurrentHighestStage: this.currentHighestStage // Logged for info, but not used in count decision
                            });

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
                                // This 'else' block will now likely never be reached for completedScenes,
                                // unless the initial filtering changes. Keep for potential future debug.
                                // Log skipped scenes for clarity
                                // Use the view's helper
                                this.debugLog(`Skipped scene for week ${weekYear} ratio count (Should not happen for completedScenes now)`, {
                                    scenePath: page.file.path
                                });
                            }
                            // --- End Modified Counting Logic ---

                            // Track scenes by week and stage for week completion indicators (this is separate)
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
                cls: 'week-number' 
            });

            // Get stats for this week
            const weekStats = this.completedWeekStats.get(weekYear);
            
            // Always create the week number span, but maybe add a class later
            const weekNumSpan = weekCell.createSpan({
                cls: 'week-number-small',
                text: weekNum.toString()
            });

            if (weekStats && weekStats.sceneCount >= 1) {
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
                const dayCell = weekRow.createEl('td');
                // Create a span for the date number
                dayCell.createSpan({ text: cellDate.getDate().toString() });
                
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
                const isFutureTodo = todoFutureDates.has(dateKey);
                const isFutureWorking = workingFutureDates.has(dateKey);
                const isOverdue = overdueDates.has(dateKey);
                const isPastDate = currentDate < today && !isToday;
                
                // Make the cell clickable if it has scenes or tasks
                if (hasScenes || isFutureTodo || isFutureWorking || isOverdue) {
                    dayCell.addClass('clickable-cell');
                    
                    // Apply classes for future states
                    if (isFutureTodo) {
                        dayCell.addClass('future-todo');
                    }
                    if (isFutureWorking) {
                        dayCell.addClass('future-working'); // Add a class if needed for other styling
                    }
                    
                    // Overdue indicator takes priority visually
                    if (isOverdue) {
                        // Check if there's ALSO a completed scene for this day
                        const hasCompletedScene = notesByDate.get(dateKey)?.some(note => 
                            isNoteComplete(note) // Use helper function
                        );

                        if (hasCompletedScene) {
                            // *** Add Debugging Here ***
                            this.debugLog(`Creating SPLIT dot for ${dateKey}. isOverdue: ${isOverdue}, hasCompletedScene: ${hasCompletedScene}`);
                            // *** End Debugging ***
                            // Create SPLIT dot: Overdue + Completed Stage
                            hasAddedRealDot = true;
                            const splitDot = dayCell.createDiv({ cls: 'revision-dot split-revision' });
                            
                            // Find the first completed scene to get its stage for the color
                            const completedNote = notesByDate.get(dateKey)?.find(note => 
                                isNoteComplete(note) // Use helper function
                            );

                            let stageCls = 'stage-zero'; // Default
                            if (completedNote && completedNote["Publish Stage"]) {
                                 let publishStage = completedNote["Publish Stage"];
                                 if (Array.isArray(publishStage)) {
                                    publishStage = publishStage[0] || "ZERO";
                                }
                                const stageMap = { "Zero": "ZERO", "First": "AUTHOR", "Editing": "HOUSE", "Press": "PRESS" };
                                if (publishStage in stageMap) {
                                    publishStage = stageMap[publishStage as keyof typeof stageMap];
                                } else {
                                    publishStage = publishStage.toString().toUpperCase();
                                }
                                stageCls = `stage-${publishStage.toLowerCase()}`;
                            }
                            
                            // First half: Completed scene stage color
                            splitDot.createDiv({ cls: `revision-part ${stageCls}` });
                            // Second half: Overdue color
                            splitDot.createDiv({ cls: 'revision-part overdue' });

                        } else {
                            // *** Add Debugging Here ***
                            this.debugLog(`Creating REGULAR overdue dot for ${dateKey}. isOverdue: ${isOverdue}, hasCompletedScene: ${hasCompletedScene}`);
                             // *** End Debugging ***
                           // Create REGULAR overdue dot (only overdue, no completed)
                            hasAddedRealDot = true;
                            const overdueDot = dayCell.createDiv({ cls: 'revision-dot overdue' });
                        }
                    }
                    // If not overdue, check for future Working status
                    else if (isFutureWorking) {
                        const workingDot = dayCell.createDiv({ cls: 'revision-dot working' }); // Use pink dot
                        hasAddedRealDot = true;
                    }
                    // If not overdue or future, check for future Todo status
                    else if (isFutureTodo) {
                        const futureTodoDot = dayCell.createDiv({ cls: 'revision-dot future-todo-dot' }); // Use grey dot
                        hasAddedRealDot = true;
                    }
                    // If not overdue or future, show completed scene indicators
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

                                    // Add 'revised' class if it's a Stage Zero dot AND
                                    // any completed Stage Zero note for this date has Revision > 0
                                    if (check.stage === "ZERO") {
                                        // Check both ZERO and Zero formats, and handle array format
                                        const completedStageZeroNotes = notesByDate.get(dateKey)?.filter(note => {
                                            // Check if the note is complete
                                            const isComplete = isNoteComplete(note);
                                            // Get the publish stage with legacy format support
                                            let publishStage = note['Publish Stage'];
                                            
                                            // Handle array format
                                            if (Array.isArray(publishStage)) {
                                                publishStage = publishStage[0] || "";
                                            }
                                            
                                            // Normalize to uppercase for checking
                                            const normalizedStage = typeof publishStage === 'string' 
                                                ? publishStage.toUpperCase() 
                                                : "";
                                            
                                            // Check for ZERO stage
                                            return isComplete && normalizedStage === "ZERO";
                                        });
                                        
                                        // Check if any completed Stage Zero note has revision > 0
                                        const hasRevisedStageZero = completedStageZeroNotes ? completedStageZeroNotes.some(note => 
                                            note.Revision && note.Revision > 0
                                        ) : false;
                                        
                                        // Add the 'revised' class if we found a revised Stage Zero note
                                        if (hasRevisedStageZero) {
                                            revisionDot.addClass('revised');
                                        }
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

                        // 1. Get open files
                        const openLeaves = this.app.workspace.getLeavesOfType('markdown');
                        const openFiles = new Map<string, WorkspaceLeaf>();
                        openLeaves.forEach(leaf => {
                            const viewState = leaf.getViewState();
                            const filePath = viewState.state?.file;
                            if (filePath && typeof filePath === 'string') {
                                openFiles.set(filePath, leaf);
                            }
                        });

                        // 2. Determine day type and define target notes
                        const isOverdueDay = overdueDates.has(cellDateKey);
                        const hasCompletedSceneOnDay = notesForDate.some(note => isNoteComplete(note));
                        const isSplitDotDay = isOverdueDay && hasCompletedSceneOnDay;

                        let targetNotes: DataviewPage[];
                        if (isSplitDotDay) {
                            this.debugLog(`Split dot day click: Targeting only overdue scenes for ${cellDateKey}`);
                            targetNotes = notesForDate.filter(note => !isNoteComplete(note));
                        } else {
                            this.debugLog(`Normal day click: Targeting all scenes for ${cellDateKey}`);
                            targetNotes = notesForDate;
                        }

                        this.debugLog(`Target Notes Partition for ${cellDateKey}:`, {
                            totalTargets: targetNotes.length,
                            openTargets: targetNotes.filter(n => openFiles.has(n.file.path)).map(n => n.file.path),
                            closedTargets: targetNotes.filter(n => !openFiles.has(n.file.path)).map(n => n.file.path)
                        });

                        // 4. Activate existing tab (if any)
                        let didActivateTab = false;
                        if (targetNotes.length > 0) {
                            const firstOpenNotePath = targetNotes[0].file.path;
                            const existingLeaf = openFiles.get(firstOpenNotePath);
                            if (existingLeaf) {
                                this.app.workspace.revealLeaf(existingLeaf);
                                didActivateTab = true;
                                this.debugLog(`Activated existing tab for ${firstOpenNotePath}`);
                            }
                        }

                        // 5. Open closed tabs
                        const processedFiles = new Set<string>(); // Avoid accidental duplicates if logic errors
                        targetNotes.forEach((note, index) => {
                            const filePath = note.file.path;
                            if (processedFiles.has(filePath)) return; // Safety check
                            processedFiles.add(filePath);

                            const file = this.app.vault.getAbstractFileByPath(filePath);
                            if (file && file instanceof TFile) {
                                const shouldActivate = !didActivateTab && index === 0;
                                this.debugLog(`Opening closed note: ${filePath}, Activate: ${shouldActivate}`);
                                this.app.workspace.openLinkText(
                                    file.path,
                                    "",
                                    true, // Open in new tab
                                    { active: shouldActivate } 
                                );
                            }
                        });
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
                                    item.classList.add('overdue'); // Add overdue class
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
                            if (isFutureTodo) {
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
                                    item.classList.add('future-todo'); // Add future-todo class
                                    item.textContent = note.file.path.split('/').pop()?.replace('.md', '') || '';
                                    futureList.appendChild(item);
                                });
                                
                                futureSection.appendChild(futureList);
                                tooltipElement.appendChild(futureSection);
                            }

                            // Add Future Working section
                            // Filter for notes that are marked as future working and not overdue
                            const futureWorkingNotes = notesForDate.filter(page => 
                                workingFutureDates.has(dateKey) && 
                                !overdueDates.has(dateKey) &&
                                page.Status && 
                                ((typeof page.Status === 'string' && page.Status === 'Working') ||
                                (Array.isArray(page.Status) && page.Status.includes('Working')))
                            );

                            if (futureWorkingNotes.length > 0) {
                                const workingSection = document.createElement('div');
                                workingSection.className = 'tooltip-section working-section'; 
                                const workingHeading = document.createElement('h4');
                                workingHeading.textContent = 'Working On';
                                // Styling is handled by CSS rule: .tooltip-section.working-section h4
                                workingSection.appendChild(workingHeading);
                                const workingList = document.createElement('ul');
                                futureWorkingNotes.forEach(note => {
                                    const item = document.createElement('li');
                                    item.classList.add('working'); // Apply pink color class
                                    item.textContent = note.file.path.split('/').pop()?.replace('.md', '') || '';
                                    workingList.appendChild(item);
                                });
                                workingSection.appendChild(workingList);
                                tooltipElement.appendChild(workingSection);
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