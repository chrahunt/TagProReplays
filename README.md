# TagProReplays

## Development

Execute `npm install` in the root directory of the project, this installs development dependencies.

When you're ready to make a new release:

1. Make sure to update the version in `package.json` and `manifest.json`.
2. `gulp zip` - this creates `tpr.zip` which should contain the necessary extension files.
3. Copy `tpr.zip`, extract, load as an unpacked extension, and test.
4. If tests pass, then make your version-release commit and any history changes to clean up ugly intermediate git commits.
5. Tag your commit with `git tag -a -m "<description of updates>" v<version>
6. `gulp zip` again to create the final version for uploading to the web store.
7. Push to the GitHub repository, make a post on /r/TagPro, and upload the zip to the Chrome developer dashboard.
