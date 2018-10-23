# Starter Projects

## Development

### Copying a starter project

1. Create a new public repository for your project (e.g. `new-repository`)
2. Create a clone of the starter repo: 
```
git clone --single-branch https://github.com/concord-consortium/starter-projects.git
```
3. Re-initialize the repo:
```
cd starter-projects
rm -rf .git
git init
```
4. Create an initial commit
```
git add .
git commit -m "Initial commit"
```
5. Push to your new repository
```
git remote add origin https://github.com/concord-consortium/new-repository.git
git push -u origin master
```
6. Remove the temporary repository and re-clone your new one.
```
cd ..
rm -rf starter-projects
git clone https://github.com/concord-consortium/new-repository.git
```
7. Open your new repository and update all instances of `starter-projects` to `new-repository` and `Starter Projects` to `New Repository`. Note: this will do some of the configuration for Travis deployment to S3, but you'll still need to follow the instructions [here](https://docs.google.com/document/d/e/2PACX-1vTpYjbGmUMxk_FswUmapK_RzVyEtm1WdnFcNByp9mqwHnp0nR_EzRUOiubuUCsGwzQgOnut_UiabYOM/pub).
8. Your new repository is ready! Remove this section of the `README`, and follow the steps below to use it.

### Initial steps

1. Clone this repo and `cd` into it
2. Run `npm install` to pull dependencies
3. Run `npm start` to run `webpack-dev-server` in development mode with hot module replacement

### Building

If you want to build a local version run `npm build`, it will create the files in the `dist` folder.
You *do not* need to build to deploy the code, that is automatic.  See more info in the Deployment section below.

### Notes

1. Make sure if you are using Visual Studio Code that you use the workspace version of TypeScript.
   To ensure that you are open a TypeScript file in VSC and then click on the version number next to
   `TypeScript React` in the status bar and select 'Use Workspace Version' in the popup menu.

## Deployment

*TODO* Set up Travis Deployment

Production releases to S3 are based on the contents of the /dist folder and are built automatically by Travis
for each branch pushed to GitHub and each merge into production.

Merges into production are deployed to http://starter-projects.concord.org.

Other branches are deployed to http://starter-projects.concord.org/branch/<name>.

You can view the status of all the branch deploys [here](https://travis-ci.org/concord-consortium/starter-projects/branches).

To deploy a production release:

1. Increment version number in package.json
2. Create new entry in CHANGELOG.md
3. Run `git log --pretty=oneline --reverse <last release tag>...HEAD | grep '#' | grep -v Merge` and add contents (after edits if needed to CHANGELOG.md)
4. Run `npm run build`
5. Copy asset size markdown table from previous release and change sizes to match new sizes in `dist`
6. Create `release-<version>` branch and commit changes, push to GitHub, create PR and merge
7. Checkout master and pull
8. Checkout production
9. Run `git merge master --no-ff`
10. Push production to GitHub
11. Use https://github.com/concord-consortium/starter-projects/releases to create a new release tag

### Testing

Run `npm test` to run jest tests. Run `npm run test:full` to run jest and Cypress tests.

## License

Starter Projects are Copyright 2018 (c) by the Concord Consortium and is distributed under the [MIT license](http://www.opensource.org/licenses/MIT).

See license.md for the complete license text.