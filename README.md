# Obsidian-Hexo Integration Plugin

The Obsidian-Hexo Integration plugin allows you to monitor changes in your Obsidian vault, specifically the _posts folder, and automatically commit and push them to your Hexo blog repository, without set up local node.js environment and accelerate the speed from writing to publishment.

## Features

### No local environment required
Hexo requires a lot of dependency when you want to publish your blog, and always introduced to a lot of version conflict.

This plugin allows you to publish your blog without setting up a local environment. All you need is a GitHub account and the source markdown file. The compilation will run on the GitHub Actions server.
### Integration with Obsidian
Obsidian is a great note-taking app, and it's also a great tool for writing blog posts. This plugin allows you to write your blog posts in Obsidian and publish them to your blog with a single click, without having to switch between apps and committing and pushing changes manually.
### Automatic deployment
The pushed changes will trigger the GitHub Actions workflow, which will automatically compile and deploy your blog to GitHub Pages.

### Support for cloud storage
The plugin supports cloud storage, such as iCloud, Dropbox, OneDrive, etc. You can use the cloud storage to sync your Obsidian vault between devices. In my case, I stored both Obsidian vault and blog source file in the Onedrive.

### Future features list

- [ ] Enable the function windows. Currently only support macOS.
- [ ] Unit test, integration test and related CI for the code quality.
- [ ] Transform and substitute Obsidian-style internal links to Hexo-style URLs in Github Actions.
## Installation
### Pre-requisites
In this plugin, we need to repository. One is the source file repository, and the other is the blog repository.

The blog source file repository is the repository that you use to store your blog source file. It could be private. And another repository is used to store the compiled static web file. Please follow the [GitHub pages](https://pages.github.com/).

### GitHub Actions setup
### Obsidian setup
### Write and publish
Download the latest release from the GitHub repository.
Extract the obsidian-hexo-integration folder from the zip to your vault's plugins folder: <vault>/.obsidian/plugins/
Note: On some operating systems it will be a hidden folder.
Reload Obsidian
If the plugin is installed correctly, you will have a new Obsidian Hexo Integration option in the settings tab.
Usage
After you have installed the plugin, go to the settings and specify the Hexo blog source path. The plugin will monitor the changes in the _posts directory and automatically commit and push the changes to your blog repository.

## Support
Please open an issue for support.
## Contributing
Please contribute using Github Flow. Create a branch, add commits, and open a Pull Request.

Please replace placeholders with appropriate content, and make sure to elaborate on features and usage according to your plugin's functionality.
