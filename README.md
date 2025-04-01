# Documentation

A compact calendar plugin for Obsidian that helps track manuscript revision stages. The calendar displays in the sidebar with week numbers and shows revision status with colored dots. The Manuscript Calendar was designed specifically for creative fiction writers to track progress and manage upcoming scene deadlines. By providing a visual representation of your writing schedule, it helps you maintain a steady pace throughout your manuscript development. This tool bridges the gap between planning and execution, making it easier to stay on track with your writing goals and deadlines.

<div style="border: 1px solid #444; border-radius: 8px; padding: 15px; margin: 15px 0;">
Sister Plugin <b>Manuscript Timeline</b>

Looking for an All-in-One visually striking circular Timeline of your entire story structure?
Check out the complementary [Manuscript Timeline](https://github.com/EricRhysTaylor/Obsidian-Manuscript-Timeline?tab=readme-ov-file#readme) plugin!
It provides a radial visualization of your manuscript, organizing scenes by act, subplot, and chronological order.

You can find it on GitHub or by searching for "Manuscript Timeline" in the Obsidian Community Plugins browser.
</div>

## Features

*   Compact calendar view that fits in the sidebar
*   Week numbers displayed in the leftmost column
*   Colored dots indicate scenes based on their revision status and stage
*   Only shows completed scenes (Due date is today or in the past)
*   Indicates future 'Todo' scenes and overdue scenes
*   Displays weekly scene/word count ratio SVG. Example 3/23 means 3 scenes complete and 2300 words written
*   Displays overall manuscript Publish Stage in the header
*   Month navigation and 'TODAY' button
*   Clickable dates to open associated scene files
*   Tooltips on hover showing scene details including in [3] the revision number

<div style="text-align: center;">
<a href="https://raw.githubusercontent.com/EricRhysTaylor/Obsidian-Manuscript-Calendar/master/screenshot.png" target="_blank">
  <img src="https://raw.githubusercontent.com/EricRhysTaylor/Obsidian-Manuscript-Calendar/master/screenshot.png" alt="Manuscript Calendar Screenshot" style="max-width: 50%; border-radius: 8px; border: 1px solid #444;">
</a>
<div style="font-size: 0.8em; margin-top: 5px; color: #888;">
  Click image to view full size
</div>
</div>

## How to Use

1.  Install the plugin via Obsidian's Community Plugins browser.
2.  Configure the Manuscript Folder in the plugin settings (Settings -> Community Plugins -> Manuscript Calendar) if your scenes reside in a specific folder. Leave blank to scan the entire vault.
3.  Ensure your scene files have the required frontmatter metadata (see below).
4.  Activate the view using the Ribbon icon (calendar icon) or the Command Palette (search for "Manuscript Calendar->Open").
5.  The calendar will appear in the right sidebar and automatically update when relevant scene files are modified or settings are changed.

## Required Scene Metadata

For the calendar to function correctly, your scene files need the following frontmatter:

```yaml
---
Class: Scene        # Required: Identifies the note as a scene.
Status: Complete    # Required: Scene status (e.g., Todo, Working, Complete). Affects indicators.
Due: YYYY-MM-DD     # Required: The date used to place the scene on the calendar.
Publish Stage: Zero # Optional: Stage (Zero, Author, House, Press). Defaults to ZERO. Affects dot colors & overall stage.
Revision: 0        # Optional: Revision number (integer). Defaults to 0. Affects dot styling for ZERO stage.
Words: 1500         # Optional: Word count for weekly ratio. Defaults to 0.
---
```

## Filtering Logic & Ratios

The calendar determines the overall manuscript Publish Stage by finding the highest stage present among all scene files (regardless of folder setting). The Zero stage is a special case in that author is encourage not to revise those scenes. Just get them written until the entire Zero draft is complete. That is why completed Zero stages with Revision > 0 are not counted. (you are dwaddling and need to move on!)

The weekly ratio SVG is calculated based on scenes matching this highest stage:

*   If Highest Stage is ZERO: Ratio counts scenes with Publish Stage: ZERO and Revision: 0.
*   If Highest Stage is AUTHOR, HOUSE, or PRESS: Ratio counts scenes with Publish Stage matching the highest stage (regardless of Revision).

Dots on individual days reflect the Publish Stage of scenes completed on that day.

## Settings

*   Manuscript Folder: Specify the folder containing your manuscript files (leave blank to scan entire vault).
*   Debug Mode: Enable detailed console logging for troubleshooting.

## Installation

### From Obsidian

1.  Open Settings > Community plugins.
2.  Turn off Safe mode if it's on.
3.  Click Browse and search for "Manuscript Calendar".
4.  Click Install and then Enable.

### Manual Installation

1.  Download the latest `main.js`, `styles.css`, `manifest.json`, `Readme.md` from the [Releases](https://github.com/EricRhysTaylor/Obsidian-Manuscript-Calendar/releases) page of the GitHub repository.
2.  Create a new folder named manuscript-calendar inside your Obsidian vault's plugins folder (`YourVault/.obsidian/plugins/`).
3.  Place the downloaded files into the manuscript-calendar folder.
4.  Reload Obsidian (Ctrl/Cmd+R).
5.  Enable the plugin in `Settings` > `Community plugins`.

## Author

Created by Eric Rhys Taylor

This plugin adheres to Obsidian.md development best practices, including secure DOM manipulation and API compliance.

## Feedback and Support

If you encounter any issues or have feature requests, please file an issue on the [GitHub repository issues page](https://github.com/EricRhysTaylor/Obsidian-Manuscript-Calendar/issues). If you find the Manuscript Calendar plugin useful and would like to support continued development, please consider buying me a coffee:

<a href="https://www.buymeacoffee.com/ericrhystaylor" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="width: 150px;" >
</a>

## License

This project is licensed under the MIT License - see the `LICENSE` file for details.
