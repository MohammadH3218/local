import zipfile
import os

# Create zip file
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zipf:
    # Add directories
    for directory in ['dist', 'node_modules']:
        for root, dirs, files in os.walk(directory):
            for file in files:
                file_path = os.path.join(root, file)
                # Use forward slashes in archive
                arcname = file_path.replace('\\', '/')
                zipf.write(file_path, arcname)

    # Add files
    for file in ['package.json', 'Procfile']:
        if os.path.exists(file):
            zipf.write(file, file)

print(f"Created deploy.zip: {os.path.getsize('deploy.zip') / 1024 / 1024:.2f} MB")
