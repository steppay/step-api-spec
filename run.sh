#!/bin/bash

ENV=${1:-production}

echo "Installing packages..."
npm install

echo "Fetching API specs in $ENV environment..."
APP_ENV=$ENV yarn fetch

tags=('v1' 'public' 'manager' 'customer' 'internal' 'admin' 'payment', 'all')
for tag in "${tags[@]}"; do
    echo "Combining API spec for segment: $tag"
    API_SEGMENT=$tag yarn combine
done

echo "Building with merged_all spec..."
API_SPEC_FILE=merged_all yarn build

echo "Script completed!"
