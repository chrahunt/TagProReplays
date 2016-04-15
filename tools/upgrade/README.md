These scripts help switch between the current and new versions of TagProReplays, which is useful for troubleshooting the database upgrading.

Make sure `gulp watch` is not running when either of the scripts is called.

Assumes that the `build/dev` directory has been loaded in Chrome as an unpacked extension.

You may need to run batch script in elevated command prompt. You can avoid this by allowing non-administrators to create symlinks per [this](http://superuser.com/questions/124679/how-do-i-create-a-link-in-windows-7-home-premium-as-a-regular-user) post.

`change.bat` takes me from new to old, sets the linked folder, moves the current dev build, etc.
`changeback.bat` takes me from old to new (the `use-dexie` branch, at least), moves the dev build folder back, and starts `dev-watch`.
