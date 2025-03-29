# Manuscript Calendar for Obsidian

A compact calendar plugin for Obsidian that helps track manuscript revision stages. The calendar displays in the sidebar with week numbers and shows revision status with colored dots.

## Features

- Compact calendar view that fits in the sidebar
- Week numbers displayed in the leftmost column
- Colored dots indicate scenes based on their revision status
- Only shows completed scenes (Due date is today or in the past)
- Dropdown to select current Publish Stage (Zero, First, Editing, Press)
- Month navigation

## How to Use

1. Install the plugin
2. Click the calendar icon in the ribbon to open the calendar view in the sidebar
3. Add the following frontmatter to your manuscript notes:

```yaml
---
title: Your Scene Title
Due: 2023-11-15
Revision: 0
Publish Stage: Zero  # Options: Zero, First, Editing, Press
---
```

## Filtering Logic

The calendar filters scenes based on the selected Publish Stage:

- **Zero**: Shows only scenes with Revision = 0
- **First**: Shows only scenes with Publish Stage = "First" and Revision > 0
- **Editing**: Shows only scenes with Publish Stage = "Editing"
- **Press**: Shows only scenes with Publish Stage = "Press"

## Requirements

- Obsidian v0.15.0 or higher
- Dataview plugin (for querying notes with metadata)

## Settings

- **Default Publish Stage**: Set the default stage for the calendar view
- **Manuscript Folder**: Specify the folder containing your manuscript files (default: "/Book 1/")

## Installation

### From Obsidian

1. Open Settings > Community plugins
2. Turn off Safe mode if it's on
3. Click Browse and search for "Manuscript Calendar"
4. Install the plugin and enable it

### Manual Installation

1. Download the latest release
2. Extract the zip file into your Obsidian vault's `.obsidian/plugins/manuscript-calendar/` folder
3. Enable the plugin in Obsidian's settings

## Commands

- **Open Manuscript Calendar**: Opens the calendar view in the right sidebar
- You can also click the calendar icon in the ribbon

## Author

Created by Eric Rhys Taylor

## Support

If you encounter any issues or have feature requests, please file an issue on the [GitHub repository](https://github.com/yourusername/obsidian-manuscript-calendar).
