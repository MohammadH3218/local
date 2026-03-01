import zipfile

with zipfile.ZipFile('deploy.zip', 'r') as z:
    files = z.namelist()
    main_files = [f for f in files if 'dist/main' in f]
    print("Files containing 'dist/main':")
    for f in main_files[:10]:
        print(f"  {f}")

    print(f"\nTotal files in zip: {len(files)}")
    print("\nFirst 20 files:")
    for f in files[:20]:
        print(f"  {f}")
