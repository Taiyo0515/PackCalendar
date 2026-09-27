# Adds the widget extension and native bridge files to the Capacitor Xcode project.
# Runs on macOS CI (gem install xcodeproj). Safe to run more than once.
require 'xcodeproj'

project = Xcodeproj::Project.open(File.expand_path('../../ios/App/App.xcodeproj', __dir__))
app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')
app_group = project.main_group['App'] or abort('App group not found')

def ref_for(group, path)
  group.files.find { |f| f.path == path } || group.new_reference(path)
end

%w[PackBridgePlugin.swift MainViewController.swift SharedGroup.swift].each do |file|
  ref = ref_for(app_group, file)
  app.add_file_references([ref]) unless app.source_build_phase.files_references.include?(ref)
end
ref_for(app_group, 'App.entitlements')
app.build_configurations.each do |c|
  c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
end

unless project.targets.any? { |t| t.name == 'PackWidget' }
  widget = project.new_target(:app_extension, 'PackWidget', :ios, '17.0')
  group = project.main_group['PackWidget'] || project.main_group.new_group('PackWidget', 'PackWidget')
  widget.add_file_references([ref_for(group, 'PackWidget.swift'), ref_for(app_group, 'SharedGroup.swift')])
  ref_for(group, 'Info.plist')
  ref_for(group, 'PackWidget.entitlements')
  widget.build_configurations.each do |c|
    s = c.build_settings
    s['PRODUCT_NAME'] = '$(TARGET_NAME)'
    s['PRODUCT_BUNDLE_IDENTIFIER'] = 'io.github.taiyo0515.packcalendar.widget'
    s['INFOPLIST_FILE'] = 'PackWidget/Info.plist'
    s['GENERATE_INFOPLIST_FILE'] = 'NO'
    s['CODE_SIGN_ENTITLEMENTS'] = 'PackWidget/PackWidget.entitlements'
    s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
    s['SWIFT_VERSION'] = '5.0'
    s['TARGETED_DEVICE_FAMILY'] = '1,2'
    s['SKIP_INSTALL'] = 'YES'
    s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
    s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  end
  app.add_dependency(widget)
  embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
          app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.dst_subfolder_spec = '13' # PlugIns
  file = embed.add_file_reference(widget.product_reference, true)
  file.settings = { 'ATTRIBUTES' => ['RemoveHeaderMirrorOnCopy'] }
end

project.save
puts 'Widget target ready'
