1. Project Information

Project Name: Media Drive

Group Information: Group 61 
Lee Cheuk Fung 14084969
Chan Hiu Kwun 14078625

2. Project Introduction
 Media Drive is a cloud-based multimedia storage and playback platform that allows users to upload, manage, and play MP3/MP4 files online via a webpage, and supports RESTful APIs for data management and integration.

Project Structure:

server.js (Main file, implements routing/database/authentication logic, etc.)

package.json (Dependency configuration, auto-package)

public/ (Static resource folder, contains logo, global CSS styles, etc.)

views/ (EJS template pages: list.ejs, login.ejs, create.ejs, edit.ejs, delete.ejs, etc., supports dynamic UI)

README.md (Project documentation)

3.cloud-based server URL
https://comp3810sef-group61.onrender.com

4.Operation guides
Login Page (Facebook OAuth Authentication): Login is required to manage files.

Main List Page: After logging in, you can view all uploaded audio and video files, supporting playback, editing, and deletion.

Upload Function: Upload MP3/MP4 files, fill in the file name and description.

Edit Function: Change the file name and description, or re-upload and replace the file.

Delete Function: Delete unwanted files.