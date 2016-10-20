#circle-jacoco-badge

Lets you render coverage badges using JaCoCo coverage information from its XML report. A few things are required to set it up.

 - **CircleCI API token**: Generate an API token with `view-builds` scope.
 - **Configure `circle.yml`**: Add the following lines to your `circle.yml`
   ```yml
    general:
      artifacts:
        - "build/reports/jacoco"
    ```
    If your coverage report is elsewhere, provide that path instead. Note that this should be the parent directory that contains all your JaCoCo coverage reports.
    
The default assumption is that the XML coverage-file is located at `build/reports/jacoco/jacocoTestReport.xml`.

You can now generate coverage badges using the following URLs:
 - **Line-coverage**: `http://circle-jacoco-badge.herokuapp.com/line?author=:author&project=:project&circle-token=:circle-token`
 - **Branch-coverage**: `http://circle-jacoco-badge.herokuapp.com/branch?author=:author&project=:project&circle-token=:circle-token` 
 - **Cyclomatic complexity**: `http://circle-jacoco-badge.herokuapp.com/complexity?author=:author&project=:project&circle-token=:circle-token`
 
If your XML report is elsewhere, you can provide a path to the respective reports using the `coverage-file` parameter; this is a path to the XML coverage-file (must be under the same artifact directory specified in `circle.yml`). For example, if you defined your coverage artifact-directory as `build/my/coverage/reports` and your coverage-file relative to that directory is at `my/xml/coverage.xml`, then the full path would be `build/my/coverage/reports/my/xml/coverage.xml`.
 
You can also link to the coverage report using `http://circle-jacoco-badge.herokuapp.com/report?author=:author&project=:project&circle-token=:circle-token`. This will redirect you to the actual `index.html` file of the report. The default assumption is that the HTML report's `index.html` is at `build/reports/jacoco/html/index.html`.

If your HTML report is elsewhere, you can provide a path to the respective `index.html` file using the `report-file` parameter (must be under the same artifact directory specified in `circle.yml`). For example, if you defined your coverage artifact-directory as `build/my/coverage/reports` and your HTML report file relative to that directory is at `my/html/index.html`, then the full path would be `build/my/coverage/reports/my/html/index.html`.

Here's some sample markdown code that shows you how to render badges and link to the coverage report at the same time (the badges are on separate lines for readbility, but you can put them all on a single line so that all badges are also rendered on a single line):
```markdown
[![JaCoCo](http://circle-jacoco-badge.herokuapp.com/line?author=:author&project=:project&circle-token=:circle-token)](http://circle-jacoco-badge.herokuapp.com/report?author=:author&project=:project&circle-token=:circle-token) 
[![JaCoCo](http://circle-jacoco-badge.herokuapp.com/branch?author=:author&project=:project&circle-token=:circle-token)](http://circle-jacoco-badge.herokuapp.com/report?author=:author&project=:project&circle-token=:circle-token) 
[![JaCoCo](http://circle-jacoco-badge.herokuapp.com/complexity?author=:author&project=:project&circle-token=:circle-token)](http://circle-jacoco-badge.herokuapp.com/report?author=:author&project=:project&circle-token=:circle-token)
```

**Note**: This is something I whipped up very quickly. It's not pretty and there are instances where badge-images can be broken:
 - If the heroku instance is idling, then you can get a broken image. Wait a few seconds and reload the page to see if the badge comes up.
 - If you have a lot of manually-copied or moved artifacts (i.e., if you manually moved them under the `$CIRCLE_ARTIFACTS` directory) then it may take the script some time to find the actual coverage artifacts you defined using the path in `circle.yml`. The CircleCI API only returns a list of artifacts and so the script has to go through each one to find the one it wants; if this takes a lot of time, GitHub will timeout the request causing a broken image. The only solution would be to decrease the number of manually-moved artifacts, or see if you can explicitly define them like the coverage artifact (explicitly-defined artifacts all have a common parent-path relative to the root of the container). 
  - If you get an "error image" (red with question-marks) then this is due to misconfiguration - either your token is invalid, or the expected artifact could not be found. 
