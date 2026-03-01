import zipfile
import os
import shutil

# Clean up old deployment files
if os.path.exists('deploy_temp'):
    shutil.rmtree('deploy_temp')
os.makedirs('deploy_temp')

# Copy necessary files/folders
print("Copying files...")
shutil.copytree('dist', 'deploy_temp/dist')
shutil.copytree('../../node_modules', 'deploy_temp/node_modules')
shutil.copy('package.json', 'deploy_temp/package.json')
shutil.copy('Procfile', 'deploy_temp/Procfile')

# Create zip file
print("Creating zip...")
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk('deploy_temp'):
        for file in files:
            file_path = os.path.join(root, file)
            # Remove deploy_temp/ prefix and use forward slashes
            arcname = file_path.replace('deploy_temp\\', '').replace('deploy_temp/', '').replace('\\', '/')
            zipf.write(file_path, arcname)

# Clean up
shutil.rmtree('deploy_temp')

print(f"Created deploy.zip: {os.path.getsize('deploy.zip') / 1024 / 1024:.2f} MB")
