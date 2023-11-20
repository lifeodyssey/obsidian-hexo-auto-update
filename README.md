# Obsidian-Hexo Integration Plugin

The Obsidian-Hexo Integration plugin allows you to monitor changes in your Obsidian vault, specifically the _posts folder, and automatically commit and push them to your Hexo blog repository, without set up local node.js environment and accelerate the speed from writing to publication.

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

- [ ] Enable the function on windows. Currently only support macOS.
- [ ] Unit test, integration test and related CI for the code quality.
- [ ] Transform and substitute Obsidian-style internal links to Hexo-style URLs in Github Actions.
## Installation
### Pre-requisites
In this plugin, we need two repository. One is the source file repository, and the other is the blog repository.

The blog source file repository is the repository that you use to store your blog source file. It could be private. And another repository is used to store the compiled static web file. Please follow the [GitHub pages](https://pages.github.co).

Then please generate the ssh key pair using the following command:
``ssh-keygen -t rsa -b 4096 -C “example@email.com” -f deploy-key ``

### GitHub Repositories setup
In the repository that you use to store your blog source file, please:
1. Add the secrete key to the repository's  secrete follow this [link](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).
2. Set up the GitHub Actions. In the top level of the repository, create a folder named .github/workflows. In the folder, create a file named hexo.yml. Copy the following content to the file.
```
name: deploy blog

on:
  push:
    branches:
      - main

env:
  GIT_USER: exampleuser
  GIT_EMAIL: exampleuser@email.com
  THEME_REPO: https://github.com/next-theme/hexo-theme-next
  THEME_BRANCH: master
  DEPLOY_REPO: exampleuser/exampleuser.github.io
  DEPLOY_BRANCH: master

jobs:
  build:
    name: Build on node ${{ matrix.node_version }} and ${{ matrix.os }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        os: [ubuntu-latest]
        node_version: [18.x]

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Checkout deploy repo
        uses: actions/checkout@v3
        with:
          repository: ${{ env.DEPLOY_REPO }}
          ref: ${{ env.DEPLOY_BRANCH }}
          path: .deploy_git

      - name: Use Node.js ${{ matrix.node_version }}
        uses: actions/setup-node@v1
        with:
          node-version: ${{ matrix.node_version }}

      - name: Set up SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.PRIVIATE_KEY }}" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa
          ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts

      - name: Configuration environment
        run: |
          sudo timedatectl set-timezone "YOUR TIME ZONE"
          git config --global user.name $GIT_USER
          git config --global user.email $GIT_EMAIL

      - name: Install dependencies
        run: |
          sudo apt-get install pandoc
          npx npm-check-updates -u  
          npm install hexo-cli -g
          npm install

      - name: Deploy hexo
        run: |
          eval "$(ssh-agent -s)"
          ssh-add ~/.ssh/id_rsa
          npm run clean
          npm run build
          npm run deploy
```
Please replace the username,email and private key name with your own content.

In the repository that you use to store the compiled static web file, please add the public key to the repository's deploy key follow this [link](https://docs.github.com/en/developers/overview/managing-deploy-keys#deploy-keys).

### Obsidian setup
Install the plugin in Obsidian, and select the destination folder(I recommend to select the ``source`` folder in Hexo root path) use the selection button.
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
