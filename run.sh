#!/bin/bash

ENV=${1:-production}

echo "Installing packages..."
yarn install

echo "Fetching API specs in $ENV environment..."
APP_ENV=$ENV yarn fetch

tags=('v1' 'public' 'manager' 'customer' 'internal' 'admin' 'payment', 'all')
# tags=('v1')
for tag in "${tags[@]}"; do
    echo "Combining API spec for segment: $tag"
    API_SEGMENT=$tag yarn combine
done

for tag in "${tags[@]}"; do
    echo "V1 API spec for segment: $tag"
    API_SEGMENT=$tag yarn stoplight
done

echo "Building with all spec..."
API_SPEC_FILE=all yarn build

echo "Script completed!"
