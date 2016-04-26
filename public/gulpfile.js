var gulp = require('gulp');
var polybuild = require('polybuild');
 
gulp.task('build', function() {
  return gulp.src('index.html')

  .pipe(polybuild())
  .pipe(gulp.dest('.'))
;
})
