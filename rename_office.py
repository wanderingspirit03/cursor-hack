import os
import glob

# Rename directory
os.system('mv webview-ui/src/office webview-ui/src/factory')

# Rename files
os.system('mv webview-ui/src/factory/components/OfficeCanvas.tsx webview-ui/src/factory/components/FactoryCanvas.tsx')
os.system('mv webview-ui/src/factory/engine/officeState.ts webview-ui/src/factory/engine/factoryState.ts')

# Text replacements
def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
        
    new_content = content.replace('office', 'factory').replace('Office', 'Factory')
    
    if content != new_content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('webview-ui/src'):
    for file in files:
        if file.endswith(('.ts', '.tsx', '.json', '.md')):
            replace_in_file(os.path.join(root, file))

# Update package.json and README.md
replace_in_file('package.json')
replace_in_file('README.md')
